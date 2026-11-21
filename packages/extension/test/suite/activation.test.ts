/**
 * Activation, opt-in and isolation (AT5.1, AT5.2 as VS Code reads the manifest, AT5.6 from inside the instance).
 * Runs first (see .vscode-test.mjs), before any suite activates the extension itself.
 */
import * as assert from 'node:assert/strict';
import { homedir } from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';

import type { OpenBoardResult } from '../../src/api';
import { FAKE_RUNNER, FakeModelWorkspace } from './fakeWorkspace';
import { closeAllEditors, EXTENSION_ID, getApi, waitFor, workspacePaths } from './helpers';

suite('activation, opt-in and isolation', () => {
  test('the opted-in workspace activates the extension by itself (workspaceContains:**/.telelean/config.json)', async function () {
    this.timeout(30_000);
    const extension = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(extension, `${EXTENSION_ID} is not loaded`);
    await waitFor(() => extension.isActive, 25_000, 'the workspaceContains activation');
  });

  test('VS Code sees the 3 commands, the settings with their defaults and the 6 colours', async () => {
    const commands = await vscode.commands.getCommands(true);
    for (const id of ['telelean.openBoard', 'telelean.initializeModel', 'telelean.refresh']) assert.ok(commands.includes(id), id);
    const config = vscode.workspace.getConfiguration('telelean');
    assert.deepEqual(
      {
        cap: config.get('memory.capGiB'),
        min: config.get('memory.minAvailableGiB'),
        refresh: config.get('refresh.enabled'),
        debounce: config.get('refresh.debounceMs'),
        snapshots: config.get('git.snapshotRefs'),
        git: config.get('git.path'),
      },
      { cap: 4, min: 2, refresh: true, debounce: 750, snapshots: true, git: 'git' },
    );
    // M2 (docs/m2-plan.md section 8.3): the run settings VS Code read from the manifest.
    assert.deepEqual(
      {
        model: config.get('model'),
        effort: config.get('effort'),
        claudePath: config.get('claude.path'),
        maxTurns: config.get('run.maxTurns'),
        maxChecks: config.get('run.maxChecks'),
        maxAgentMinutes: config.get('run.maxAgentMinutes'),
        leanJobSeconds: config.get('run.leanJobSeconds'),
        maxGateAttempts: config.get('run.maxGateAttempts'),
        keepRuns: config.get('run.keepRuns'),
        contextScope: config.get('run.contextScope'),
      },
      {
        model: 'claude-opus-5-5',
        effort: 'high',
        claudePath: '',
        maxTurns: 80,
        maxChecks: 25,
        maxAgentMinutes: 20,
        leanJobSeconds: 120,
        maxGateAttempts: 3,
        keepRuns: 10,
        contextScope: 'subject',
      },
    );
    const manifest = vscode.extensions.getExtension(EXTENSION_ID)?.packageJSON as { contributes: { colors: Array<{ id: string }> } };
    assert.deepEqual(
      manifest.contributes.colors.map((c) => c.id),
      // Spec v4 (slice 1a): the two kinds' stripes and the proved green of the established glow and the band.
      ['telelean.kindAxiom', 'telelean.kindProposition', 'telelean.proved', 'telelean.formalizedAura', 'telelean.vocabulary', 'telelean.highlight'],
    );
  });

  test('the instance runs in the isolated profile (HOME, XDG dirs, git config) set up by scripts/smoke.mjs', () => {
    const dir = process.env.TELELEAN_SMOKE_DIR;
    assert.ok(dir, 'TELELEAN_SMOKE_DIR is not set in the extension host');
    assert.equal(homedir(), path.join(dir, 'home'));
    assert.equal(process.env.XDG_CONFIG_HOME, path.join(dir, 'xdg-config'));
    assert.equal(process.env.XDG_CACHE_HOME, path.join(dir, 'xdg-cache'));
    assert.equal(process.env.XDG_DATA_HOME, path.join(dir, 'xdg-data'));
    assert.equal(process.env.GIT_CONFIG_GLOBAL, '/dev/null');
    assert.equal(process.env.GIT_CONFIG_NOSYSTEM, '1');
    assert.equal(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath, path.join(dir, 'ws'));
    assert.equal(vscode.workspace.getConfiguration('chat').get('disableAIFeatures'), true);
    assert.equal(vscode.workspace.getConfiguration('telemetry').get('telemetryLevel'), 'off');
  });

  test('a folder without .telelean gets no board and no model workspace (so it never runs Lean)', async () => {
    const api = await getApi();
    const { plain } = workspacePaths();
    const result = await vscode.commands.executeCommand<OpenBoardResult>('telelean.openBoard', { root: plain });
    assert.match(result.error ?? '', /not a telelean model/);
    assert.equal(api.boardFor(plain), undefined);
    assert.equal(api.workspaceFor(plain), undefined);
  });

  test('with two model roots Open Board asks which one; the answer (a test argument) opens that board', async function () {
    this.timeout(60_000);
    const api = await getApi();
    assert.ok(api.testing, 'the test API exists in Test mode');
    const restore = api.testing.useRunner(FAKE_RUNNER);
    try {
      const { mental, second } = workspacePaths();
      const result = await vscode.commands.executeCommand<OpenBoardResult>('telelean.openBoard', { pick: 'second_model' });
      assert.deepEqual(result, { root: second, asked: true });
      assert.equal(api.boardFor(second)?.panel.title, 'telelean: second_model');
      assert.equal(api.boardFor(mental), undefined);
      const unanswered = await vscode.commands.executeCommand<OpenBoardResult>('telelean.openBoard', { pick: 'nothing-like-this' });
      assert.equal(unanswered.asked, true);
      assert.match(unanswered.error ?? '', /no model root matches/);
      const fake = FakeModelWorkspace.instances.find((w) => w.root === second);
      assert.ok(fake, 'the board created the root workspace');
      await waitFor(() => fake.refreshRequests.includes('open'), 10_000, 'requestRefresh("open")');
    } finally {
      await api.testing.reset();
      restore();
      await closeAllEditors();
    }
  });
});
