/**
 * The extension host's M2 wiring (docs/m2-plan.md section 8) against test/unit/vscodeStub.ts, a fake model workspace
 * and a recording RunManager (WP3's real one is tested in the runner):
 *
 *   one RunManager per model root, created with its workspace, recovered once, disposed with it (8.1)
 *   the egress consent: asked once per root (a modal with the plan's text), a yes remembered, a no starts nothing (8.2, AT5.2)
 *   the lazy backend: built only at a start, with the dist/bin guard; refused in Test mode unless a test installed one (8.4, AT5.4)
 *   the raw Lean diff: vscode.changes over the read-only telelean-proposal: provider, base left (AT5.6)
 *   deactivation: the run managers are disposed (and awaited) before the workspaces (AT5.9)
 *
 * No test builds a real Claude backend: createClaudeBackend is a recording fake, and TELELEAN_NO_REAL_CLAUDE=1 is set by
 * vitest.config.mts besides.
 */
import { DEFAULT_RUN_SETTINGS } from '@telelean/runner/run/index.js';
import { FakeBackend } from '@telelean/runner/llm/fake.js';
import type { ClaudeCliBackend } from '@telelean/runner/llm/claudeCli.js';
import type { ClaudeBackendSettings, RunManagerOptions } from '@telelean/runner/run/types.js';
import { rootKeyOf } from '@telelean/runner/shadow/index.js';
import type { LeanCheckEngine } from '@telelean/runner/gate/types.js';
import type { ProposalService, RunSidecarStore } from '@telelean/runner/proposal/types.js';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import type * as vscode from 'vscode';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { TeleleanApi } from '../../src/api';
import { activate, deactivate } from '../../src/extension';
import { CONSENT_DECLINED, CONSENT_DETAIL, CONSENT_MESSAGE, consentKey, TEST_MODE_NO_CLAUDE } from '../../src/logic/runs';
import { TeleleanHost } from '../../src/vscode/host';
import type { RunnerFunctions } from '../../src/vscode/runner';
import { FakeRunManager, FakeWorkspace, sampleRun } from './fakes';
import * as stub from './vscodeStub';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const ENGINE = { engine: true } as unknown as LeanCheckEngine;
const PROPOSALS = { proposals: true } as unknown as ProposalService;
const SIDECARS = { sidecars: true } as unknown as RunSidecarStore;
const HOOK = { command: '/usr/local/bin/node', args: [] };
const START = { target: 'cynder-not-good', premises: ['cynder-dark-past', 'new-spyro-pg', 'pg-no-dark-past'] };

let dir: string;
let rootA: string;
let rootB: string;
let storage: string;
let globalState: Map<string, unknown>;
let records: unknown;
let managers: FakeRunManager[];
let workspaces: FakeWorkspace[];
let claudeCalls: ClaudeBackendSettings[];
let order: string[];
let hosts: TeleleanHost[];
const claudeBackend = { id: 'claude-cli' } as unknown as ClaudeCliBackend;

function context(mode: stub.ExtensionMode, withStorage = true) {
  return {
    extensionMode: mode,
    extension: { packageJSON: { version: '0.0.1' } },
    extensionUri: stub.Uri.file('/ext'),
    ...(withStorage ? { globalStorageUri: stub.Uri.file(storage) } : {}),
    subscriptions: [] as Array<{ dispose(): void }>,
    workspaceState: {
      get: () => records,
      update: async (_key: string, value: unknown) => {
        records = value;
      },
    },
    globalState: {
      get: (key: string) => globalState.get(key),
      update: async (key: string, value: unknown) => {
        if (value === undefined) globalState.delete(key);
        else globalState.set(key, value);
      },
      keys: () => [...globalState.keys()],
    },
  };
}

const log = { info: () => undefined, warn: () => undefined, error: () => undefined, debug: () => undefined, trace: () => undefined };

const runner: Partial<RunnerFunctions> = {
  findModelRoots: async (folder: string) => (folder === dir ? [rootA, rootB] : []),
  createModelWorkspace: (options) => {
    const ws = new FakeWorkspace(options.root);
    ws.dispose = () => void order.push(`workspace.dispose ${path.basename(options.root)}`);
    workspaces.push(ws);
    return ws;
  },
  createRunManager: (options: RunManagerOptions) => {
    const manager = new FakeRunManager(options);
    manager.onDispose = () => void order.push(`runs.dispose ${path.basename(options.root)}`);
    managers.push(manager);
    return manager;
  },
  createClaudeBackend: async (settings: ClaudeBackendSettings) => {
    claudeCalls.push(settings);
    return { backend: claudeBackend, binary: { path: '/opt/claude/resources/native-binary/claude', source: 'vscode-extension', version: '2.1.314' } };
  },
  createLeanCheckEngine: () => ENGINE,
  createProposalService: () => PROPOSALS,
  createRunSidecarStore: () => SIDECARS,
  defaultHookRuntime: () => HOOK,
};

function newHost(mode: stub.ExtensionMode, withStorage = true): { host: TeleleanHost; api: TeleleanApi } {
  const host = new TeleleanHost(context(mode, withStorage) as unknown as vscode.ExtensionContext, log as unknown as vscode.LogOutputChannel, { runner });
  hosts.push(host);
  return { host, api: host.api() };
}

const panelOf = (api: TeleleanApi, root: string) => api.boardFor(root)?.panel as unknown as stub.FakePanel;
const posted = (api: TeleleanApi, root: string) => panelOf(api, root).posted as Array<{ type: string; payload: Record<string, unknown> }>;

/** Sends a message as the root's board webview and returns the outcome posted for its request id. */
async function request(api: TeleleanApi, root: string, type: string, payload: Record<string, unknown>) {
  await api.simulateBoardMessage(root, { v: 1, type, payload });
  const result = posted(api, root).find((m) => m.type === 'actionResult' && m.payload.requestId === payload.requestId);
  if (!result) throw new Error(`no actionResult for ${String(payload.requestId)}`);
  return result.payload.outcome as { ok: boolean; code?: string; error?: string; label?: string };
}

beforeEach(async () => {
  stub.resetStub();
  dir = await mkdtemp(path.join(process.env.TELELEAN_TEST_TMP ?? tmpdir(), 'tl-host-runs-'));
  rootA = path.join(dir, 'model_a');
  rootB = path.join(dir, 'model_b');
  storage = path.join(dir, 'globalStorage');
  for (const root of [rootA, rootB]) {
    await mkdir(path.join(root, '.telelean'), { recursive: true });
    await writeFile(path.join(root, '.telelean', 'config.json'), '{"format":"telelean-config","version":1,"library":"Model"}\n');
  }
  stub.workspace.workspaceFolders = [{ uri: stub.Uri.file(dir), name: 'ws', index: 0 }];
  globalState = new Map();
  records = undefined;
  managers = [];
  workspaces = [];
  claudeCalls = [];
  order = [];
  hosts = [];
});

afterEach(async () => {
  for (const host of hosts) host.dispose();
  await rm(dir, { recursive: true, force: true });
});

describe('one RunManager per model root (section 8.1)', () => {
  it('is created with the root\'s workspace, runs dir and settings, recovered once, and outlives its board', async () => {
    const { host, api } = newHost(stub.ExtensionMode.Test);
    await host.openBoardCommand({ root: rootA });
    expect(managers).toHaveLength(1);
    const [manager] = managers;
    if (!manager?.options) throw new Error('no RunManager');
    const { options } = manager;
    expect(options.root).toBe(rootA);
    expect(options.runsDir).toBe(path.join(storage, 'runs'));
    expect(options.workspace).toBe(api.workspaceFor(rootA));
    expect(options.settings).toEqual(DEFAULT_RUN_SETTINGS); // the stub's configuration has no user values
    expect(options.services.engine).toBe(ENGINE);
    expect(options.services.proposals).toBe(PROPOSALS);
    expect(options.services.sidecars).toBe(SIDECARS);
    expect(typeof options.services.backend).toBe('function'); // lazy: a factory, not a backend
    expect(claudeCalls).toEqual([]); // opening a board never resolves or runs a Claude binary
    await sleep(0);
    expect(manager.callsOf('recover')).toEqual([[]]);
    expect(api.runsFor(rootA)).toBe(manager);

    await host.openBoardCommand({ root: rootA }); // reveal: no second manager
    api.boardFor(rootA)?.panel.dispose(); // closing the board does not stop a run (D-25)
    await host.openBoardCommand({ root: rootA });
    expect(managers).toHaveLength(1);
    expect(manager.callsOf('recover')).toHaveLength(1);
    expect(manager.callsOf('dispose')).toEqual([]);

    await host.openBoardCommand({ root: rootB });
    expect(managers.map((m) => m.options?.root)).toEqual([rootA, rootB]);
  });

  it('is disposed with its workspace, before it (testing.disposeWorkspace, as a window reload)', async () => {
    const { host, api } = newHost(stub.ExtensionMode.Test);
    await host.openBoardCommand({ root: rootA });
    await api.testing?.disposeWorkspace(rootA);
    expect(order).toEqual(['runs.dispose model_a', 'workspace.dispose model_a']);
    expect(api.boardFor(rootA)).toBeUndefined();
    expect(api.runsFor(rootA)).toBeUndefined();
    await host.openBoardCommand({ root: rootA }); // a new window: a new workspace and RunManager, recovered again
    expect(managers).toHaveLength(2);
    await sleep(0);
    expect(managers[1]?.callsOf('recover')).toHaveLength(1);
  });

  it('the board gets the run and the session once attached (2h: no proposal), and on every change of the RunManager', async () => {
    const { host, api } = newHost(stub.ExtensionMode.Test);
    await host.openBoardCommand({ root: rootA });
    await sleep(0);
    expect(posted(api, rootA).map((m) => m.type)).toEqual(['workspace', 'graph', 'run', 'session']);
    const manager = managers[0];
    if (!manager) throw new Error('no RunManager');
    manager.run = sampleRun({ state: 'waiting-for-answer', subject: 'Other' });
    manager.fire({ run: true, proposal: false , session: false });
    await sleep(0);
    const last = posted(api, rootA).at(-1);
    expect(last?.type).toBe('run');
    expect((last?.payload.run as { subject: string }).subject).toBe('Other');
  });

  it('without a storage folder runs are unavailable: the board still works and a start says why', async () => {
    const { host, api } = newHost(stub.ExtensionMode.Test, false);
    await host.openBoardCommand({ root: rootA });
    expect(managers).toEqual([]);
    api.testing?.answerPrompts({ claudeConsent: true });
    const outcome = await request(api, rootA, 'formalize', { inferences: [START], requestId: 's1' });
    expect(outcome).toEqual({ ok: false, code: 'not-yet', error: 'Claude runs are not available: VS Code gave telelean no global storage folder for its run directories' });
  });
});

describe('the lazy backend and the Test-mode guard (AT5.4)', () => {
  it('Test mode without useRunBackend: the start is refused with "real Claude is disabled in Test mode"; createClaudeBackend is never called', async () => {
    const { host, api } = newHost(stub.ExtensionMode.Test);
    await host.openBoardCommand({ root: rootA });
    api.testing?.answerPrompts({ claudeConsent: true });
    const outcome = await request(api, rootA, 'formalize', { inferences: [START], requestId: 's1' });
    expect(outcome).toEqual({ ok: false, code: 'not-yet', error: TEST_MODE_NO_CLAUDE });
    expect(claudeCalls).toEqual([]);
    expect(managers[0]?.backend).toBeUndefined();
  });

  it('Test mode with useRunBackend: the RunManager gets exactly the injected FakeBackend (for its root); restoring removes it', async () => {
    const { host, api } = newHost(stub.ExtensionMode.Test);
    await host.openBoardCommand({ root: rootA });
    api.testing?.answerPrompts({ claudeConsent: true });
    const fake = new FakeBackend([]);
    const roots: string[] = [];
    const restore = api.testing?.useRunBackend((root) => (roots.push(root), fake));
    const outcome = await request(api, rootA, 'formalize', { inferences: [START], requestId: 's1' });
    expect(outcome).toMatchObject({ ok: true });
    expect(managers[0]?.backend).toBe(fake);
    expect(roots).toEqual([rootA]);
    expect(claudeCalls).toEqual([]);

    restore?.();
    await host.openBoardCommand({ root: rootB });
    expect(await request(api, rootB, 'formalize', { inferences: [START], requestId: 's2' })).toEqual({ ok: false, code: 'not-yet', error: TEST_MODE_NO_CLAUDE });
  });

  it('Production: createClaudeBackend runs only at a start, with the dist/bin guard, the hook runtime, telelean/<version>, setpriv, and the Claude extension\'s folder first', async () => {
    stub.installedExtensions.set('anthropic.claude-code', { id: 'anthropic.claude-code', extensionPath: '/opt/vscode/extensions/anthropic.claude-code-2.1.314-linux-x64' });
    const { host, api } = newHost(stub.ExtensionMode.Production);
    await host.openBoardCommand({ root: rootA });
    expect(claudeCalls).toEqual([]);
    stub.messageAnswers.push('Run with Claude');
    const outcome = await request(api, rootA, 'formalize', { inferences: [START], requestId: 's1' });
    expect(outcome).toMatchObject({ ok: true });
    expect(claudeCalls).toHaveLength(1);
    expect(claudeCalls[0]).toMatchObject({
      guardScriptPath: path.join('/ext', 'dist', 'bin', 'telelean-path-guard.mjs'),
      hookRuntime: HOOK,
      clientApp: 'telelean/0.0.1',
      pdeathsig: true,
    });
    expect(claudeCalls[0]?.extensionDirs?.[0]).toBe('/opt/vscode/extensions');
    expect(claudeCalls[0]).not.toHaveProperty('claudePath'); // telelean.claude.path unset: automatic search
    expect(managers[0]?.backend).toBe(claudeBackend);
  });
});

describe('egress consent, once per model root (AT5.2)', () => {
  it('asks with the plan\'s modal, remembers a yes per root; a no starts nothing and is asked again next time', async () => {
    const { host, api } = newHost(stub.ExtensionMode.Production);
    await host.openBoardCommand({ root: rootA });
    stub.messageAnswers.push('Run with Claude');
    expect(await request(api, rootA, 'formalize', { inferences: [START], requestId: 'a1' })).toMatchObject({ ok: true });
    expect(stub.shown).toEqual([
      { level: 'info', message: CONSENT_MESSAGE, options: { modal: true, detail: CONSENT_DETAIL }, items: ['Run with Claude'], answer: 'Run with Claude' },
    ]);
    expect(globalState.get(consentKey(rootKeyOf(rootA)))).toBe(true);
    expect(managers[0]?.callsOf('formalize')).toEqual([[{ subject: 'Spyro', inferences: [START] }]]);

    // The same root again: no question (the run ended in the meantime).
    if (managers[0]) managers[0].run = sampleRun({ state: 'accepted' });
    expect(await request(api, rootA, 'formalize', { inferences: [START], requestId: 'a2' })).toMatchObject({ ok: true });
    expect(stub.shown).toHaveLength(1);
    expect(managers[0]?.callsOf('formalize')).toHaveLength(2);

    // Another root asks again; dismissing the modal starts nothing, declares nothing, and is not remembered.
    await host.openBoardCommand({ root: rootB });
    expect(await request(api, rootB, 'formalize', { inferences: [START], requestId: 'b1' })).toEqual({ ok: false, code: 'not-yet', error: CONSENT_DECLINED });
    expect(stub.shown).toHaveLength(2);
    expect(managers[1]?.calls.filter((c) => c.method === 'formalize')).toEqual([]);
    expect(workspaces[1]?.performed).toEqual([]);
    expect(globalState.has(consentKey(rootKeyOf(rootB)))).toBe(false);
    stub.messageAnswers.push('Run with Claude');
    expect(await request(api, rootB, 'formalize', { inferences: [START], requestId: 'b2' })).toMatchObject({ ok: true });
    expect(stub.shown).toHaveLength(3);
  });

  it('a busy root refuses at once (conflict) without asking', async () => {
    const { host, api } = newHost(stub.ExtensionMode.Production);
    await host.openBoardCommand({ root: rootA });
    if (managers[0]) managers[0].run = sampleRun({ state: 'working' });
    expect(await request(api, rootA, 'formalize', { inferences: [START], requestId: 'a1' })).toMatchObject({ ok: false, code: 'conflict' });
    expect(stub.shown).toEqual([]);
  });

  it('Test mode: the testing API answers the consent; reset() forgets the remembered consents and the run backend', async () => {
    const { host, api } = newHost(stub.ExtensionMode.Test);
    await host.openBoardCommand({ root: rootA });
    expect(await request(api, rootA, 'formalize', { inferences: [START], requestId: 't1' })).toEqual({ ok: false, code: 'not-yet', error: CONSENT_DECLINED }); // unanswered = no
    api.testing?.answerPrompts({ claudeConsent: true });
    api.testing?.useRunBackend(() => new FakeBackend([]));
    expect(await request(api, rootA, 'formalize', { inferences: [START], requestId: 't2' })).toMatchObject({ ok: true });
    expect(globalState.get(consentKey(rootKeyOf(rootA)))).toBe(true);
    expect(stub.shown).toEqual([]); // never a real modal in Test mode
    await api.testing?.reset();
    expect(globalState.size).toBe(0);
    await host.openBoardCommand({ root: rootA });
    api.testing?.answerPrompts({ claudeConsent: true });
    expect(await request(api, rootA, 'formalize', { inferences: [START], requestId: 't3' })).toEqual({ ok: false, code: 'not-yet', error: TEST_MODE_NO_CLAUDE });
  });
});

describe('the raw Lean diff (AT5.6; since 2h only a session\'s, openSessionDiff)', () => {
  it('opens vscode.changes over the read-only telelean-proposal: provider: base on the left, the working copy on the right', async () => {
    const { host, api } = newHost(stub.ExtensionMode.Test);
    await host.openBoardCommand({ root: rootA });
    const manager = managers[0];
    if (!manager) throw new Error('no RunManager');
    manager.sessionDiffFiles = [
      { path: 'Model/Spyro/Main.lean', before: 'abbrev a : Prop := True\n', after: 'abbrev a : Prop := True\ntheorem a.holds : a := trivial\n' },
      { path: 'Model/Spyro/Lemmas.lean', before: null, after: 'namespace Spyro\nend Spyro\n' },
    ];
    await api.simulateBoardMessage(rootA, { v: 1, type: 'openSessionDiff', payload: { runId: 'r1', stage: 1, requestId: 'd1' } });
    const changes = stub.executed.filter((c) => c.id === 'vscode.changes');
    expect(changes).toHaveLength(1);
    const [title, resources] = changes[0]?.args as [string, Array<[stub.Uri, stub.Uri | undefined, stub.Uri | undefined]>];
    expect(title).toBe('Raw Lean diff: Spyro');
    expect(resources.map(([file, left, right]) => [file.fsPath, left?.scheme, right?.scheme])).toEqual([
      [path.join(rootA, 'Model', 'Spyro', 'Main.lean'), 'telelean-proposal', 'telelean-proposal'],
      [path.join(rootA, 'Model', 'Spyro', 'Lemmas.lean'), undefined, 'telelean-proposal'], // created by the proposal
    ]);
    const provider = stub.providers.get('telelean-proposal');
    expect(provider).toBeDefined();
    const [main, lemmas] = resources;
    if (!main?.[1] || !main[2] || !lemmas?.[2]) throw new Error('missing sides');
    expect(provider?.provideTextDocumentContent(main[1])).toBe('abbrev a : Prop := True\n');
    expect(provider?.provideTextDocumentContent(main[2])).toBe('abbrev a : Prop := True\ntheorem a.holds : a := trivial\n');
    expect(provider?.provideTextDocumentContent(lemmas[2])).toBe('namespace Spyro\nend Spyro\n');
    expect(provider?.provideTextDocumentContent(stub.Uri.from({ scheme: 'telelean-proposal', path: '/Model/Spyro/Main.lean', query: 'preview=gone' }))).toMatch(/no longer available/);
    expect(stub.providers.has('telelean-history')).toBe(true); // the history previews keep their own scheme
  });
});

describe('deactivation (AT5.9)', () => {
  it('disposes every RunManager first and waits for it, then VS Code disposes the workspaces', async () => {
    const ctx = context(stub.ExtensionMode.Test);
    const api = activate(ctx as unknown as vscode.ExtensionContext);
    api.testing?.useRunner(runner);
    await vscodeCommand(api, rootA);
    await vscodeCommand(api, rootB);
    const [first] = managers;
    if (!first) throw new Error('no RunManager');
    // A manager that finishes persisting and closing its session a little later (its dispose returns a promise).
    let persisted = false;
    first.run = sampleRun({ state: 'working' });
    first.disposeResult = sleep(30).then(() => {
      persisted = true;
      if (first.run) first.run = { ...first.run, state: 'interrupted', canResume: true };
    });
    await deactivate();
    expect(persisted).toBe(true); // deactivate waited for it
    expect(first.run?.state).toBe('interrupted');
    expect(order).toEqual(['runs.dispose model_a', 'runs.dispose model_b']); // the workspaces are still there
    for (const disposable of ctx.subscriptions) disposable.dispose(); // what VS Code does after deactivate()
    expect(order).toEqual(['runs.dispose model_a', 'runs.dispose model_b', 'workspace.dispose model_a', 'workspace.dispose model_b']);
    expect(managers.map((m) => m.callsOf('dispose').length)).toEqual([1, 1]); // never twice
  });
});

/** Opens a root's board through the activated extension's API path (Open Board with a root). */
async function vscodeCommand(api: TeleleanApi, root: string): Promise<void> {
  // The stub's registerCommand records nothing, so open through restoreBoard's sibling: a fake panel the host adopts.
  const panel = stub.fakePanel(`telelean: ${path.basename(root)}`);
  await api.restoreBoard(panel as unknown as vscode.WebviewPanel, { root });
  for (let i = 0; i < 100 && api.workspaceFor(root) === undefined; i++) await sleep(5);
  if (api.workspaceFor(root) === undefined) throw new Error(`the board of ${root} did not load`);
}
