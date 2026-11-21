/**
 * Model boards in a real VS Code with the extension's real adapters (panels, serializer, TextSource, EditApplier on
 * WorkspaceEdit + save, watchers, clipboard, editor, history diff editor, Initialize), driven by a fake model
 * workspace (test/suite/fakeWorkspace.ts) through the test API, so they run before the runner's workspace (WP4)
 * is integrated. model.test.ts repeats the flow against the real workspace once it exists.
 */
import * as assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';

import type { HistoryListing } from '@telelean/core';

import type { OpenBoardResult, TeleleanApi } from '../../src/api';
import type { InitializeResult } from '../../src/logic/initialize';
import { FAKE_RUNNER, FakeModelWorkspace } from './fakeWorkspace';
import {
  closeAllEditors,
  closeTextEditors,
  getApi,
  isRendered,
  message,
  nextBoardMessage,
  nextPost,
  postsOf,
  recordPosts,
  sleep,
  waitFor,
  workspacePaths,
} from './helpers';

const read = (file: string) => (existsSync(file) ? readFileSync(file, 'utf8') : null);

suite('model boards (fake model workspace, real VS Code adapters)', () => {
  let api: TeleleanApi;
  let restoreRunner: () => void;
  let recorder: ReturnType<typeof recordPosts>;
  const paths = () => workspacePaths();
  const fakeFor = (root: string) => {
    const ws = api.workspaceFor(root);
    assert.ok(ws instanceof FakeModelWorkspace, `no fake workspace for ${root}`);
    return ws;
  };
  /** Sends a message as the board's webview would and returns the actionResult for its requestId. */
  async function request(root: string, type: string, payload: Record<string, unknown>) {
    const requestId = String(payload.requestId);
    const result = nextPost(api, (e) => e.root === root && e.message.type === 'actionResult' && e.message.payload.requestId === requestId, 30_000, `actionResult ${requestId}`);
    await api.simulateBoardMessage(root, message(type, payload));
    const event = await result;
    assert.ok(event.message.type === 'actionResult');
    return event.message.payload.outcome;
  }

  suiteSetup(async () => {
    api = await getApi();
    assert.ok(api.testing, 'the test API exists in Test mode');
    await api.testing.reset();
    restoreRunner = api.testing.useRunner(FAKE_RUNNER);
    recorder = recordPosts(api);
  });

  suiteTeardown(async () => {
    recorder?.dispose();
    await api.testing?.reset();
    restoreRunner?.();
    await closeAllEditors();
  });

  test('one BoardPanel per model root; reopening reveals it; the webview renders the root board', async function () {
    this.timeout(90_000);
    const { mental, second } = paths();
    const rendered = nextBoardMessage(api, mental, isRendered, 60_000, 'the "rendered" diagnostic');
    const first = await vscode.commands.executeCommand<OpenBoardResult>('telelean.openBoard', { root: mental });
    assert.deepEqual(first, { root: mental, asked: false });
    const board = api.boardFor(mental);
    assert.ok(board);
    assert.equal(board.panel.title, 'telelean: mental_model');
    assert.equal(board.panel.viewType, 'telelean.board');
    assert.equal(board.subject, 'Spyro');
    const done = await rendered;
    assert.ok(done.type === 'diagnostic');
    console.log(`      webview reported: ${done.payload.message}`);
    assert.equal(done.payload.data?.cards, 4, done.payload.message);

    await vscode.commands.executeCommand('telelean.openBoard', { root: mental });
    assert.equal(api.boardFor(mental)?.panel, board.panel, 'a second panel was created for the same root');
    await vscode.commands.executeCommand('telelean.openBoard', { root: second });
    assert.equal(api.boards().filter((b) => !b.sample).length, 2);
    assert.notEqual(api.boardFor(second)?.panel, board.panel);
    assert.ok(postsOf(recorder.posts, 'workspace', mental).some((m) => m.payload.state.subject === 'Spyro'));
    assert.ok(fakeFor(mental).refreshRequests.includes('open'), 'opening the board requests a Lean refresh');
  });

  test('createSubject switches the board; the serializer restores root and subject; undo makes it vanish and the board switches back', async function () {
    this.timeout(90_000);
    const { mental } = paths();
    const outcome = await request(mental, 'createSubject', { name: 'Bayonetta', requestId: 'cs1' });
    assert.equal(outcome.ok, true, JSON.stringify(outcome));
    assert.equal(api.boardFor(mental)?.subject, 'Bayonetta');
    for (const file of ['Model/Bayonetta.lean', 'Model/Bayonetta/Vocabulary.lean', 'Model/Bayonetta/Inbox.lean', 'Model/Bayonetta/Main.lean', '.telelean/subjects/Bayonetta/layout.json']) {
      assert.ok(existsSync(path.join(mental, file)), `${file} was not created`);
    }
    assert.match(read(path.join(mental, 'Model.lean')) ?? '', /import Model\.Bayonetta\n$/);
    await waitFor(() => api.boardRecords().some((r) => r.root === mental && r.subject === 'Bayonetta'), 5000, 'the board record to follow the subject');

    // Close the board: the model workspace (and its undo stack) stays; a restored panel gets root and subject back.
    const workspace = api.workspaceFor(mental);
    api.boardFor(mental)?.panel.dispose();
    await waitFor(() => api.boardFor(mental) === undefined, 5000, 'the board to close');
    assert.equal(api.workspaceFor(mental), workspace, 'closing the board must keep the workspace (undo survives)');
    const restored = vscode.window.createWebviewPanel('telelean.board', 'telelean: mental_model', vscode.ViewColumn.Active, { enableScripts: true });
    // The serializer resolves as soon as the panel shows the board (VS Code creates a restored webview only after
    // that); the model session attaches in the background.
    await api.restoreBoard(restored, undefined);
    assert.equal(api.boardFor(mental)?.panel, restored);
    await waitFor(() => api.boardFor(mental)?.subject === 'Bayonetta', 10_000, 'the restored board to show subject Bayonetta');

    // Undo the new subject: its files go, the subject vanishes, the board switches to the first remaining subject.
    const notice = nextPost(api, (e) => e.root === mental && e.message.type === 'notice' && /no longer exists/.test(e.message.payload.text), 30_000, 'the vanished-subject notice');
    const undone = await request(mental, 'undo', { requestId: 'u-cs1' });
    assert.equal(undone.ok, true, JSON.stringify(undone));
    const event = await notice;
    assert.ok(event.message.type === 'notice');
    assert.equal(event.message.payload.text, 'Subject "Bayonetta" no longer exists; showing "Spyro".');
    assert.equal(api.boardFor(mental)?.subject, 'Spyro');
    assert.equal(existsSync(path.join(mental, 'Model/Bayonetta/Main.lean')), false);
    assert.doesNotMatch(read(path.join(mental, 'Model.lean')) ?? '', /Bayonetta/);
  });

  test('a state saved by the webview ({ root, subject }) also restores a board', async function () {
    this.timeout(30_000);
    const { second } = paths();
    api.boardFor(second)?.panel.dispose();
    await waitFor(() => api.boardFor(second) === undefined, 5000, 'the board to close');
    const panel = vscode.window.createWebviewPanel('telelean.board', 'some old title', vscode.ViewColumn.Active, { enableScripts: true });
    await api.restoreBoard(panel, { root: second, subject: 'Spyro' });
    assert.equal(api.boardFor(second)?.panel, panel);
    assert.equal(panel.title, 'telelean: second_model');
    await waitFor(() => api.boardFor(second)?.subject === 'Spyro', 10_000, 'the restored board to show subject Spyro');
  });

  test('addNode writes a block to Model/Spyro/Inbox.lean through the EditApplier (WorkspaceEdit + save); undo removes it', async function () {
    this.timeout(60_000);
    const { mental } = paths();
    const inbox = path.join(mental, 'Model', 'Spyro', 'Inbox.lean');
    const before = read(inbox);
    const graph = nextPost(api, (e) => e.root === mental && e.message.type === 'graph' && e.message.payload.graph.nodes.length === 5, 30_000, 'a graph with 5 cards');
    const outcome = await request(mental, 'addNode', { clientId: 'tmp-1', type: 'AXIOM', naturalName: 'Cynder can fly', requestId: 'add1' });
    assert.deepEqual(outcome, { ok: true, label: 'Add axiom: Cynder can fly', undoable: true, nodeId: 'cynder-can-fly' });
    assert.match(read(inbox) ?? '', /natural_name: Cynder can fly\n/);
    await graph;
    // (Post events fire once VS Code reports delivery; the change event inside perform publishes this graph before
    // the notice is even posted, so wait for the notice itself.)
    await waitFor(
      () => postsOf(recorder.posts, 'notice', mental).some((n) => n.payload.text === 'Add axiom: Cynder can fly' && n.payload.undoable),
      10_000,
      'the undoable "Add axiom" notice',
    );
    const doc = vscode.workspace.textDocuments.find((d) => d.uri.fsPath === inbox);
    assert.ok(!doc?.isDirty, 'the edited file must be saved');

    const undone = await request(mental, 'undo', { requestId: 'u-add1' });
    assert.equal(undone.ok, true, JSON.stringify(undone));
    assert.equal(read(inbox), before);
  });

  test('unsaved typing in an open editor is what the TextSource reads; the applied edit keeps it and saves', async function () {
    this.timeout(60_000);
    const { mental } = paths();
    const inbox = path.join(mental, 'Model', 'Spyro', 'Inbox.lean');
    assert.equal((await request(mental, 'addNode', { clientId: 'tmp-2', type: 'PROPOSITION', naturalName: 'Spyro is purple', requestId: 'add2' })).ok, true);
    const editor = await vscode.window.showTextDocument(vscode.Uri.file(inbox), { preview: false });
    assert.ok(await editor.edit((b) => b.insert(new vscode.Position(0, 0), '-- my unsaved note\n')));
    assert.equal(editor.document.isDirty, true);
    assert.equal((await request(mental, 'addNode', { clientId: 'tmp-3', type: 'PROPOSITION', naturalName: 'Sparx follows Spyro', requestId: 'add3' })).ok, true);
    const disk = read(inbox) ?? '';
    assert.match(disk, /^-- my unsaved note\n/);
    assert.match(disk, /natural_name: Sparx follows Spyro/);
    assert.match(disk, /natural_name: Spyro is purple/);
    assert.equal(editor.document.isDirty, false);
    assert.equal(editor.document.getText(), disk);

    // A stale `before` is refused and nothing is applied (the check reads the open buffer first).
    const fake = fakeFor(mental);
    await assert.rejects(fake.options.applier.apply([{ path: 'Model/Spyro/Inbox.lean', before: 'stale\n', after: 'x\n' }], 'stale edit'), (error: unknown) => {
      assert.equal((error as { code?: string }).code, 'conflict');
      return true;
    });
    await assert.rejects(fake.options.applier.apply([{ path: 'Model/Spyro/Inbox.lean', before: null, after: 'x\n' }], 'create over'), /changed since/);
    assert.equal(read(inbox), disk);

    // Clean up: undo the last addition, remove the note by hand (undo reverses telelean's own changes only, and this
    // fake has no reverse patches), then undo the first addition.
    assert.equal((await request(mental, 'undo', { requestId: 'u-add3' })).ok, true);
    assert.match(editor.document.getText(), /^-- my unsaved note\n/);
    assert.ok(await editor.edit((b) => b.delete(new vscode.Range(0, 0, 1, 0))));
    assert.ok(await editor.document.save());
    assert.equal((await request(mental, 'undo', { requestId: 'u-add2' })).ok, true);
    assert.doesNotMatch(read(inbox) ?? '', /Sparx|purple/);
    await closeTextEditors();
  });

  test('copyText puts the code on the clipboard and says "Copied"', async function () {
    this.timeout(30_000);
    const { mental } = paths();
    const text = 'abbrev cynder_dark_past : Prop := HasDarkPast cynder\naxiom cynder_dark_past.holds : cynder_dark_past';
    const copied = nextPost(api, (e) => e.root === mental && e.message.type === 'notice' && e.message.payload.text === 'Copied', 10_000, 'the "Copied" notice');
    await api.simulateBoardMessage(mental, message('copyText', { text }));
    await copied;
    assert.equal(await vscode.env.clipboard.readText(), text);
  });

  test('openInEditor opens Model/Spyro/Main.lean at the range; a link out of the model root is refused', async function () {
    this.timeout(30_000);
    const { mental, second } = paths();
    const main = path.join(mental, 'Model', 'Spyro', 'Main.lean');
    // Select the word "namespace" wherever the sample has that line (the fixture and mental_model differ by a line).
    const line = (read(main) ?? '').split('\n').findIndex((l) => l.startsWith('namespace Spyro'));
    assert.ok(line > 0, 'Main.lean has a namespace line');
    await api.simulateBoardMessage(mental, message('openInEditor', { file: 'Model/Spyro/Main.lean', range: { start: { line, character: 0 }, end: { line, character: 9 } } }));
    await waitFor(() => vscode.window.activeTextEditor?.document.uri.fsPath === main, 10_000, 'Main.lean in the active editor');
    const editor = vscode.window.activeTextEditor;
    assert.equal(editor?.document.getText(editor.selection), 'namespace');
    assert.equal(editor?.selection.start.line, line);
    const refused = nextPost(api, (e) => e.root === second && e.message.type === 'notice' && /Not opened/.test(e.message.payload.text), 10_000, 'the refusal notice');
    await api.simulateBoardMessage(second, message('openInEditor', { file: 'escape.lean' }));
    const event = await refused;
    assert.ok(event.message.type === 'notice');
    assert.match(event.message.payload.text, /links outside the model root/);
    assert.notEqual(vscode.window.activeTextEditor?.document.uri.fsPath, path.join(paths().plain, 'Plain.lean'));
    await closeTextEditors();
  });

  test('initGit asks first; historyList, historyPreview (diff editor) and historyRevert (undoable) work', async function () {
    this.timeout(60_000);
    const { mental } = paths();
    assert.ok(api.testing);
    api.testing.answerPrompts({ initGit: false });
    const declined = await request(mental, 'initGit', { requestId: 'g0' });
    assert.deepEqual(declined, { ok: true, label: 'Not initialized: history stays off.', undoable: false });
    api.testing.answerPrompts({ initGit: true });
    const state = nextPost(api, (e) => e.root === mental && e.message.type === 'workspace' && e.message.payload.state.history.state === 'ready', 10_000, 'history: ready');
    assert.equal((await request(mental, 'initGit', { requestId: 'g1' })).ok, true);
    await state;
    api.testing.answerPrompts({ initGit: undefined });

    const inbox = path.join(mental, 'Model', 'Spyro', 'Inbox.lean');
    const beforeAdd = read(inbox);
    assert.equal((await request(mental, 'addNode', { clientId: 'tmp-4', type: 'AXIOM', naturalName: 'Cynder is a dragon', requestId: 'add4' })).ok, true);
    const listed = nextPost(api, (e) => e.root === mental && e.message.type === 'history', 10_000, 'the history listing');
    await api.simulateBoardMessage(mental, message('historyList', { subject: 'Spyro', limit: 20 }));
    const event = await listed;
    assert.ok(event.message.type === 'history');
    const listing: HistoryListing = event.message.payload.listing;
    assert.deepEqual(listing.entries.map((e) => e.label), ['Add axiom: Cynder is a dragon', 'Initial state']);
    const [added, initial] = listing.entries;
    assert.ok(added && initial);

    // The board in front (another board's tab may be the active one in its group), then the preview.
    const boardPanel = api.boardFor(mental)?.panel;
    boardPanel?.reveal();
    await waitFor(() => boardPanel?.visible === true, 10_000, 'the board in front');
    const boardColumn = boardPanel?.viewColumn;
    await api.simulateBoardMessage(mental, message('historyPreview', { subject: 'Spyro', entryId: added.id, compare: 'parent' }));
    await waitFor(
      () => vscode.window.tabGroups.all.flatMap((g) => g.tabs).some((t) => t.label.startsWith('History: Add axiom: Cynder is a dragon (')),
      15_000,
      'the history diff editor',
    );
    // The preview opens beside the board, not over it: another editor group, and the board stays visible.
    const previewGroup = vscode.window.tabGroups.all.find((g) => g.tabs.some((t) => t.label.startsWith('History: Add axiom')));
    assert.ok(previewGroup && boardColumn !== undefined && previewGroup.viewColumn !== boardColumn, `preview in column ${previewGroup?.viewColumn}, board in ${boardColumn}`);
    assert.equal(api.boardFor(mental)?.panel.visible, true, 'the board must stay visible');

    const reverted = await request(mental, 'historyRevert', { subject: 'Spyro', entryId: initial.id, requestId: 'rv1' });
    assert.equal(reverted.ok, true, JSON.stringify(reverted));
    assert.equal(reverted.ok && reverted.undoable, true);
    assert.equal(read(inbox), beforeAdd);
    const undoRevert = await request(mental, 'undo', { requestId: 'u-rv1' });
    assert.equal(undoRevert.ok, true);
    assert.match(read(inbox) ?? '', /Cynder is a dragon/);
    assert.equal((await request(mental, 'undo', { requestId: 'u-add4' })).ok, true);
    assert.equal(read(inbox), beforeAdd);
    await closeTextEditors();
  });

  test('typing only re-parses (batched); a save re-parses and requests a refresh; files changed on disk are re-read', async function () {
    this.timeout(60_000);
    const { mental } = paths();
    const fake = fakeFor(mental);
    const main = path.join(mental, 'Model', 'Spyro', 'Main.lean');
    const editor = await vscode.window.showTextDocument(vscode.Uri.file(main), { preview: false });
    fake.invalidations.length = 0;
    fake.refreshRequests.length = 0;
    for (const ch of ['-', '-', ' ', 'x']) {
      await editor.edit((b) => b.insert(new vscode.Position(0, 0), ch));
      await sleep(30);
    }
    await waitFor(() => fake.invalidations.some((p) => p.includes('Model/Spyro/Main.lean')), 5000, 'the batched invalidate');
    assert.equal(fake.invalidations.filter((p) => p.includes('Model/Spyro/Main.lean')).length, 1, `typing must be batched: ${JSON.stringify(fake.invalidations)}`);
    assert.deepEqual(fake.refreshRequests, [], 'typing must not build');
    await editor.document.save();
    await waitFor(() => fake.refreshRequests.includes('save'), 5000, 'requestRefresh("save")');
    await editor.edit((b) => b.delete(new vscode.Range(0, 0, 0, 4)));
    await editor.document.save();
    await closeTextEditors();
    await sleep(800); // the saves' own file events have arrived by now
    const requested: readonly string[] = fake.refreshRequests; // (deepEqual above narrowed the property's type to never[])
    assert.ok(!requested.includes('files'), `a save in the editor must not count as an outside change too: ${JSON.stringify(requested)}`);

    // A Lean file written by another program (a script, an agent, git): re-read, and re-checked by Lean like a save.
    fake.invalidations.length = 0;
    const extra = path.join(mental, 'Model', 'Spyro', 'Extra.lean');
    await writeFile(extra, '-- written by another tool\n');
    await writeFile(path.join(mental, '.telelean', 'graph.json'), '{}\n');
    await waitFor(() => fake.invalidations.some((p) => p.includes('Model/Spyro/Extra.lean')), 10_000, 'the file watcher to report Extra.lean');
    await waitFor(() => fake.refreshRequests.includes('files'), 10_000, 'requestRefresh("files") for a Lean file written by another program');
    await sleep(800);
    assert.equal(fake.invalidations.flat().includes('.telelean/graph.json'), false, 'graph.json must be ignored');
    await rm(extra);
    await rm(path.join(mental, '.telelean', 'graph.json'));
  });

  test('the Refresh message runs refreshNow and republishes', async function () {
    this.timeout(30_000);
    const { mental } = paths();
    const fake = fakeFor(mental);
    const calls = fake.refreshNowCalls;
    await api.simulateBoardMessage(mental, message('refresh'));
    assert.equal(fake.refreshNowCalls, calls + 1);
  });

  test('Initialize Model Here on an empty folder validates the subject, writes the scaffold, offers git and opens the board (AT5.3)', async function () {
    this.timeout(60_000);
    const { empty } = paths();
    const invalid = await vscode.commands.executeCommand<InitializeResult>('telelean.initializeModel', { folder: empty, subject: 'not a name', gitInit: true });
    assert.equal(invalid?.status, 'failed');
    assert.equal(existsSync(path.join(empty, '.telelean')), false, 'nothing may be written for an invalid name');

    const result = await vscode.commands.executeCommand<InitializeResult>('telelean.initializeModel', { folder: empty, subject: 'Notes', gitInit: true });
    assert.ok(result?.status === 'initialized', JSON.stringify(result));
    assert.equal(result.git, 'initialized');
    assert.equal(result.opened, true);
    for (const file of ['lakefile.toml', 'lean-toolchain', 'lake-manifest.json', '.gitignore', 'Model.lean', 'Model/Notes.lean', 'Model/Notes/Inbox.lean', '.telelean/config.json', '.telelean/subjects/Notes/layout.json']) {
      assert.ok(existsSync(path.join(empty, file)), `${file} missing`);
    }
    assert.equal(read(path.join(empty, 'Model.lean')), 'import Model.Notes\n');
    assert.equal(api.boardFor(empty)?.subject, 'Notes');
    assert.equal((await fakeFor(empty).historyStatus()).state, 'ready');

    const again = await vscode.commands.executeCommand<InitializeResult>('telelean.initializeModel', { folder: empty, openBoard: false });
    assert.equal(again?.status, 'already-model');
    await closeTextEditors();
  });

  test('a model that cannot be loaded says why on its board; Open Board again retries', async function () {
    this.timeout(30_000);
    assert.ok(api.testing);
    const broken = path.join(paths().ws, 'broken_model');
    await mkdir(path.join(broken, '.telelean'), { recursive: true });
    await writeFile(path.join(broken, '.telelean', 'config.json'), '{"format":"telelean-config","version":1,"library":"Model"}\n');
    const restoreThrowing = api.testing.useRunner({
      createModelWorkspace: () => {
        throw new Error('the model folder is unreadable (simulated)');
      },
    });
    try {
      const failure = nextPost(api, (e) => e.root === broken && e.message.type === 'notice' && e.message.payload.level === 'error', 15_000, 'the error notice');
      await vscode.commands.executeCommand('telelean.openBoard', { root: broken });
      const event = await failure;
      assert.ok(event.message.type === 'notice');
      assert.match(event.message.payload.text, /could not load the model in "broken_model": the model folder is unreadable \(simulated\)/);
      assert.equal(api.boardFor(broken)?.subject, undefined);
    } finally {
      restoreThrowing();
    }
    const firstPanel = api.boardFor(broken)?.panel;
    await vscode.commands.executeCommand('telelean.openBoard', { root: broken });
    const retried = api.boardFor(broken);
    assert.ok(retried && retried.panel !== firstPanel, 'the failed board is created again');
    assert.equal(retried.subject, '', 'a model without subjects shows no subject (the board offers "New subject")');
    retried.panel.dispose();
    await rm(broken, { recursive: true, force: true });
  });
});
