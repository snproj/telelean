/**
 * The board webview inside a real VS Code 1.140.0 (via @vscode/test-cli + @vscode/test-electron, under xvfb), on the
 * static sample board (`openBoard({ sample })`, the M0 prototype path; it needs no model workspace): the panel opens,
 * the bundle loads under the strict CSP and posts "ready", the stylesheet applies, the host's graph reaches the
 * webview and is rendered, no CSP violation is reported, and the theme colours the extension contributes reach the
 * webview.
 */
import type { WebviewToHostMessage } from '@telelean/core';
import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';

import type { TeleleanApi } from '../../src/api';
import { BOARD_VIEW_TYPE, EXTENSION_ID, getApi, isRendered, nextMessage, sleep } from './helpers';

suite('telelean board webview (sample board)', () => {
  let api: TeleleanApi;
  const seen: WebviewToHostMessage[] = [];
  let subscription: vscode.Disposable | undefined;

  suiteSetup(async () => {
    api = await getApi();
    await api.testing?.reset();
    subscription = api.onDidReceiveBoardMessage((message) => seen.push(message));
  });

  suiteTeardown(async () => {
    subscription?.dispose();
    await api.testing?.reset();
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  });

  test('openBoard({ sample }) opens the panel; the webview loads under the CSP, posts ready and renders the graph', async function () {
    this.timeout(90_000);
    const ready = nextMessage(api, (m) => m.type === 'ready', 60_000, '"ready"');
    const rendered = nextMessage(api, isRendered, 60_000, 'the "rendered" diagnostic');

    await vscode.commands.executeCommand('telelean.openBoard', { sample: 'spyro' });

    const panel = api.boardPanel;
    assert.ok(panel, 'no board panel after the command');
    assert.equal(panel.viewType, 'telelean.board');
    assert.equal(panel.title, 'telelean: sample');

    assert.deepEqual(await ready, { v: 1, type: 'ready', payload: { lastVersion: null } });
    const done = await rendered;
    assert.ok(done.type === 'diagnostic');
    console.log(`      webview reported: ${done.payload.message}`);

    const tabs = vscode.window.tabGroups.all.flatMap((group) => group.tabs);
    const describe = tabs.map((t) => `${t.label} [${t.input instanceof vscode.TabInputWebview ? `webview ${t.input.viewType}` : String((t.input as object | undefined)?.constructor?.name)}]`);
    const tab = tabs.find((t) => t.input instanceof vscode.TabInputWebview && t.input.viewType.endsWith(BOARD_VIEW_TYPE));
    assert.ok(tab, `no webview tab for the board; tabs: ${describe.join('; ')}`);
    assert.ok(panel.visible, 'the board panel is not visible');
    // The Spyro sample: 4 cards and 3 declared arrows, drawn by the edge engine inside the real webview.
    assert.equal(done.payload.data?.cards, 4, done.payload.message);
    assert.equal(done.payload.data?.edges, 3, done.payload.message);
    // webview.css applied: the AXIOMS list scrolls on its own, the canvas clips and its layer is positioned (spec v4 slice 1c).
    assert.equal(done.payload.data?.styled, true, done.payload.message);

    await sleep(1000); // late violations (e.g. the codicon font) would arrive by now
    const violations = seen.filter((m) => m.type === 'diagnostic' && m.payload.code === 'csp-violation');
    assert.deepEqual(violations, []);
    assert.equal(seen.filter((m) => m.type === 'diagnostic' && m.payload.level !== 'info').length, 0);
  });

  test('running the command again reveals the same panel and sends the new graph to the live webview', async function () {
    this.timeout(60_000);
    const first = api.boardPanel;
    const rendered = nextMessage(api, isRendered, 45_000, 'the "rendered" diagnostic for the large sample');
    await vscode.commands.executeCommand('telelean.openBoard', { sample: 'large' });
    assert.equal(api.boardPanel, first, 'a second panel was created');
    const done = await rendered;
    assert.ok(done.type === 'diagnostic');
    console.log(`      webview reported: ${done.payload.message}`);
    assert.equal(done.payload.data?.cards, 75, done.payload.message);
    assert.ok(Number(done.payload.data?.edges) > 0, done.payload.message);
    assert.ok(Number(done.payload.data?.stubs) > 0, `expected stubs for off-screen ends: ${done.payload.message}`);
  });

  test('a graph sent while the webview is still loading is re-sent on "ready" (the latest graph wins)', async function () {
    this.timeout(90_000);
    api.boardPanel?.dispose();
    const ready = nextMessage(api, (m) => m.type === 'ready', 60_000, '"ready" from the new panel');
    const rendered = nextMessage(api, isRendered, 60_000, 'the "rendered" diagnostic');
    await vscode.commands.executeCommand('telelean.openBoard', { sample: 'large' });
    // Immediately, before the new webview has loaded: this postMessage is not delivered.
    await vscode.commands.executeCommand('telelean.openBoard', { sample: 'spyro-proved' });
    await ready;
    const done = await rendered;
    assert.ok(done.type === 'diagnostic');
    console.log(`      webview reported: ${done.payload.message}`);
    assert.equal(done.payload.data?.cards, 4, done.payload.message);
    assert.equal(done.payload.data?.edges, 3, done.payload.message);
  });

  test('the colours the extension contributes reach the webview (workbench.colorCustomizations)', async function () {
    this.timeout(90_000);
    // One distinctive colour per contributed id. VS Code exposes each to webviews as --vscode-<id, first dot -> "-">.
    const custom: Record<string, string> = {
      'telelean.formalizedAura': '#ff00ff',
      'telelean.kindAxiom': '#00ff00',
      'telelean.kindProposition': '#ffff00',
      'telelean.proved': '#00ffff',
      'telelean.vocabulary': '#123456',
      'telelean.highlight': '#654321',
    };
    // The board reports every contributed colour as it resolved (the aura, spec v4's two kinds and its proved green,
    // M1's vocabulary and highlight).
    const expected = {
      aura: 'rgb(255, 0, 255)',
      kindA: 'rgb(0, 255, 0)',
      kindP: 'rgb(255, 255, 0)',
      proved: 'rgb(0, 255, 255)',
      vocabulary: 'rgb(18, 52, 86)',
      highlight: 'rgb(101, 67, 33)',
    };
    const resolved = (m: WebviewToHostMessage) => {
      const data = m.type === 'diagnostic' ? m.payload.data : undefined;
      return { aura: data?.aura, kindA: data?.kindA, kindP: data?.kindP, proved: data?.proved, vocabulary: data?.vocabulary, highlight: data?.highlight };
    };
    const contributed = (vscode.extensions.getExtension(EXTENSION_ID)?.packageJSON as { contributes: { colors: { id: string }[] } }).contributes.colors
      .map((c) => c.id)
      .sort();
    assert.deepEqual(contributed, Object.keys(custom).sort());

    // The test instance's own user settings (its isolated user-data dir), never the user's; restored below.
    const workbench = vscode.workspace.getConfiguration('workbench');
    await workbench.update('colorCustomizations', custom, vscode.ConfigurationTarget.Global);
    try {
      // The theme service applies the change asynchronously: reopen the board until it shows, for up to 20 s.
      const deadline = Date.now() + 20_000;
      let done: WebviewToHostMessage;
      for (;;) {
        api.boardPanel?.dispose();
        const rendered = nextMessage(api, isRendered, 45_000, 'the "rendered" diagnostic');
        await vscode.commands.executeCommand('telelean.openBoard', { sample: 'spyro' });
        done = await rendered;
        if (JSON.stringify(resolved(done)) === JSON.stringify(expected) || Date.now() > deadline) break;
        await sleep(500);
      }
      assert.ok(done.type === 'diagnostic');
      console.log(`      webview reported: ${done.payload.message}; formalised card: ${String(done.payload.data?.cardAura)}`);
      assert.deepEqual(resolved(done), expected, done.payload.message);
      assert.match(String(done.payload.data?.cardAura), /rgb\(255, 0, 255\)/, 'the formalised card does not use the aura colour');
    } finally {
      await workbench.update('colorCustomizations', undefined, vscode.ConfigurationTarget.Global);
    }
  });
});
