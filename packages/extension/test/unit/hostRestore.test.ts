/**
 * The board host's open and restore paths (AT5.4) with webviews that cannot receive anything yet. VS Code creates the
 * webview of a panel restored after a reload only after the serializer's `deserializeWebviewPanel` resolves, and it
 * holds every `postMessage` to a webview that is still loading until that webview is ready. So `restoreBoard` must
 * resolve while `postMessage` never resolves (it used to wait for the session's first messages: the restored board
 * stayed a blank tab), and the model session must attach all the same, since posting never waits for delivery.
 *
 * host.ts runs against test/unit/vscodeStub.ts (vitest.config.mts aliases `vscode` to it) and a fake model workspace.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import type * as vscode from 'vscode';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { TeleleanApi } from '../../src/api';
import { TeleleanHost } from '../../src/vscode/host';
import { FakeWorkspace } from './fakes';
import * as stub from './vscodeStub';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(condition: () => boolean, label: string, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);
    await sleep(10);
  }
}

/** Resolves with "settled" when `promise` settles within `ms`, else with "pending". */
async function within(promise: Promise<unknown>, ms: number): Promise<'settled' | 'pending'> {
  return Promise.race([promise.then(() => 'settled' as const), sleep(ms).then(() => 'pending' as const)]);
}

const typesOf = (posted: readonly unknown[]) => posted.map((m) => (m as { type?: string }).type);

let dir: string;
let root: string;
let host: TeleleanHost;
let api: TeleleanApi;
let records: unknown;
const logs: string[] = [];

beforeEach(async () => {
  stub.resetStub();
  dir = await mkdtemp(path.join(process.env.TELELEAN_TEST_TMP ?? tmpdir(), 'tl-host-'));
  root = path.join(dir, 'model_a');
  await mkdir(path.join(root, '.telelean'), { recursive: true });
  await writeFile(path.join(root, '.telelean', 'config.json'), '{"format":"telelean-config","version":1,"library":"Model"}\n');
  stub.workspace.workspaceFolders = [{ uri: stub.Uri.file(dir), name: 'ws', index: 0 }];
  records = undefined;
  logs.length = 0;
  const log = {
    info: (m: string) => logs.push(`info ${m}`),
    warn: (m: string) => logs.push(`warn ${m}`),
    error: (m: string) => logs.push(`error ${m}`),
    debug: () => undefined,
    trace: () => undefined,
  };
  const context = {
    extensionMode: stub.ExtensionMode.Test,
    extension: { packageJSON: { version: '0.0.1' } },
    extensionUri: stub.Uri.file('/extension'),
    subscriptions: [],
    workspaceState: {
      get: () => records,
      update: async (_key: string, value: unknown) => {
        records = value;
      },
    },
  };
  host = new TeleleanHost(context as unknown as vscode.ExtensionContext, log as unknown as vscode.LogOutputChannel);
  api = host.api();
  api.testing?.useRunner({
    findModelRoots: async (folder: string) => (folder === dir ? [root] : []),
    createModelWorkspace: (options) => new FakeWorkspace(options.root),
  });
});

afterEach(async () => {
  host.dispose();
  await rm(dir, { recursive: true, force: true });
});

describe('restoring a board after a reload (AT5.4)', () => {
  it('resolves while the restored webview cannot receive anything yet; the session attaches in the background', async () => {
    const panel = stub.fakePanel('telelean: model_a');
    expect(await within(api.restoreBoard(panel as unknown as vscode.WebviewPanel, undefined), 2000)).toBe('settled');
    expect(api.boardFor(root)?.panel).toBe(panel);
    expect(panel.webview.html).toContain('<div id="root"></div>'); // the board's page is in the panel

    // Posting never waits for delivery, so the session attaches and publishes although nothing arrives.
    await waitFor(() => api.boardFor(root)?.subject === 'Spyro', 'the session (subject Spyro)');
    await waitFor(() => typesOf(panel.posted).includes('graph'), 'the first graph');
    expect(typesOf(panel.posted).slice(0, 2)).toEqual(['workspace', 'graph']);
    expect((api.workspaceFor(root) as FakeWorkspace).refreshRequests).toEqual(['open']);

    // Once VS Code has created the webview, its "ready" gets a fresh publish. (2k2, D2-108: the root's runs live in the
    // model folder, so this context without a global storage folder has a RunManager too, and the publish ends with the
    // root's run and session, none here.)
    const before = panel.posted.length;
    panel.send({ v: 1, type: 'ready', payload: { lastVersion: null } });
    await waitFor(() => panel.posted.length >= before + 4, 'the publish answering "ready"');
    expect(typesOf(panel.posted.slice(before))).toEqual(['workspace', 'graph', 'run', 'session']);
  });

  it('a "ready" sent before the session is attached is answered once it is', async () => {
    const panel = stub.fakePanel('telelean: model_a');
    let release!: () => void;
    const loaded = new Promise<void>((resolve) => (release = resolve));
    api.testing?.useRunner({
      createModelWorkspace: (options) => {
        const ws = new FakeWorkspace(options.root);
        ws.load = () => loaded; // the model takes a while to load
        return ws;
      },
    });
    expect(await within(api.restoreBoard(panel as unknown as vscode.WebviewPanel, undefined), 2000)).toBe('settled');
    panel.send({ v: 1, type: 'ready', payload: { lastVersion: null } });
    await sleep(50);
    expect(panel.posted).toEqual([]); // nothing to show yet
    release();
    await waitFor(() => typesOf(panel.posted).includes('graph'), 'the graph after the model loaded');
    expect(api.boardFor(root)?.subject).toBe('Spyro');
  });

  it('a restored panel for a root whose board is already open is closed, and the open board is kept', async () => {
    await host.openBoardCommand({ root });
    const open = api.boardFor(root)?.panel;
    const panel = stub.fakePanel('telelean: model_a');
    expect(await within(api.restoreBoard(panel as unknown as vscode.WebviewPanel, undefined), 2000)).toBe('settled');
    expect(panel.disposed).toBe(true);
    expect(api.boardFor(root)?.panel).toBe(open);
  });

  it('a panel whose model folder is gone says so instead of staying blank', async () => {
    const panel = stub.fakePanel('telelean: no_such_model');
    stub.workspace.workspaceFolders = [];
    expect(await within(api.restoreBoard(panel as unknown as vscode.WebviewPanel, undefined), 2000)).toBe('settled');
    expect(panel.webview.html).toContain('<div id="root"></div>');
    panel.send({ v: 1, type: 'ready', payload: { lastVersion: null } });
    await waitFor(() => typesOf(panel.posted).includes('notice'), 'the notice');
    expect(JSON.stringify(panel.posted)).toContain('could not find the model folder');
  });
});

describe('opening a board', () => {
  it('"Open Board" resolves once the session is attached, even while the new webview has not loaded', async () => {
    const opened = host.openBoardCommand({ root });
    expect(await within(opened, 2000)).toBe('settled');
    expect(await opened).toEqual({ root, asked: false });
    const [panel] = stub.created;
    expect(panel?.title).toBe('telelean: model_a');
    expect(api.boardFor(root)?.subject).toBe('Spyro');
    expect(typesOf(panel?.posted ?? []).slice(0, 2)).toEqual(['workspace', 'graph']);
  });
});
