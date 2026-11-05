/**
 * AT5.9 with the REAL RunManager (WP3), shadow (WP2), proposal service and sidecar store (WP4) and model workspace (WP4
 * members) behind the extension host (test/unit/vscodeStub.ts), on a scratch copy of mental_model/: a run that is
 * working when the extension deactivates is persisted as `interrupted` (resumable) and its session is closed.
 *
 * (Gated on WP1-WP4 while the builders worked in parallel; the integrator removed the gate.) Only the Lean engine is a
 * fake (its base check passes at once) and preflight is injected (no toolchain, sandbox or memory check),
 * so no Lean process runs; the LLM is a backend whose turn never ends until it is closed (no Claude: Test mode, and
 * TELELEAN_NO_REAL_CLAUDE=1 from vitest.config.mts). Git runs only inside the run's shadow (WP2's isolated wrapper)
 * under the scratch dir, with GIT_CONFIG_GLOBAL=/dev/null and GIT_CONFIG_NOSYSTEM=1 set here as well.
 */
import type { CheckReport, LeanCheckEngine } from '@telelean/runner/gate/types.js';
import type { BackendCaps, LlmBackend, LlmEvent, LlmSession, SessionConfig } from '@telelean/runner/llm/types.js';
import { createRunManager } from '@telelean/runner/run/index.js';
import { rootKeyOf } from '@telelean/runner/shadow/index.js';
import { createModelWorkspace } from '@telelean/runner/workspace/index.js';
import { randomUUID } from 'node:crypto';
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type * as vscode from 'vscode';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TEST_MODE_NO_CLAUDE } from '../../src/logic/runs';
import { TeleleanHost } from '../../src/vscode/host';
import * as stub from './vscodeStub';

const SAMPLE = fileURLToPath(new URL('../../../../mental_model', import.meta.url));
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Waits until `file` (and its directory) has not changed for 400 ms (at most 5 s): pending writes have landed. */
async function settled(file: string): Promise<void> {
  const stamp = () => {
    try {
      const dir = path.dirname(file);
      return `${statSync(file).mtimeMs}:${statSync(dir).mtimeMs}:${readdirSync(dir).join(',')}`;
    } catch {
      return 'missing';
    }
  };
  let last = stamp();
  let quietSince = Date.now();
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline && Date.now() - quietSince < 400) {
    await sleep(50);
    const now = stamp();
    if (now !== last) {
      last = now;
      quietSince = Date.now();
    }
  }
}

/** Removes a scratch dir, again after a pause (a write still in flight could recreate part of it). */
async function removeScratch(dir: string): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    rmSync(dir, { recursive: true, force: true });
    await sleep(300);
    if (!existsSync(dir)) return;
  }
}

/** A session whose turns never end on their own: the run stays `working` until the session is interrupted or closed. */
class HangingSession implements LlmSession {
  readonly sessionId: string;
  closed = false;
  turns: string[] = [];
  private release: (() => void) | undefined;
  private readonly listeners = new Set<(event: LlmEvent) => void>();

  constructor(private readonly cfg: SessionConfig) {
    this.sessionId = cfg.resumeSessionId ?? cfg.sessionId ?? randomUUID();
  }

  async *send(turn: string): AsyncGenerator<LlmEvent> {
    this.turns.push(turn);
    yield this.emit({ type: 'init', sessionId: this.sessionId, model: this.cfg.model, tools: [], mcpServers: [{ name: 'telelean', status: 'connected' }], apiKeySource: 'none' });
    yield this.emit({ type: 'assistant_text', text: 'Reading the files.', parentToolUseId: null });
    await new Promise<void>((resolve) => {
      this.release = resolve;
      if (this.closed) resolve();
    });
    yield this.emit({
      type: 'result',
      status: 'interrupted',
      isError: true,
      sessionId: this.sessionId,
      numTurns: 1,
      durationMs: 1,
      usage: { inputTokens: 0, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 },
      costEstimateUsd: 0,
      modelUsage: {},
      permissionDenials: [],
      errors: [],
    });
  }
  async interrupt(): Promise<void> {
    this.release?.();
  }
  async close(): Promise<void> {
    this.closed = true;
    this.release?.();
  }
  onEvent(listener: (event: LlmEvent) => void): () => void {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }
  private emit(event: LlmEvent): LlmEvent {
    for (const listener of this.listeners) listener(event);
    return event;
  }
}

class HangingBackend implements LlmBackend {
  readonly id = 'fake' as const;
  readonly caps: BackendCaps = { builtinFileTools: true, subscriptionAuth: false, resume: true, interrupt: true };
  readonly sessions: HangingSession[] = [];
  async startSession(cfg: SessionConfig): Promise<LlmSession> {
    const session = new HangingSession(cfg);
    this.sessions.push(session);
    return session;
  }
}

const OK_REPORT: CheckReport = { outcome: 'ok', g0: [], findings: [], diagnostics: [], durationMs: 1 };
const unused = (name: string) => async (): Promise<never> => {
  throw new Error(`engine.${name} is not used by this test`);
};
const FAKE_ENGINE: LeanCheckEngine = {
  checkBase: async () => OK_REPORT,
  normalise: unused('normalise'),
  check: unused('check'),
  freeze: unused('freeze'),
  gate: unused('gate'),
  checkGhost: unused('checkGhost'),
  renderStatements: unused('renderStatements'),
};

interface PersistedView {
  view?: { runId?: string; state?: string; canResume?: boolean };
}

describe('deactivation with the real RunManager (AT5.9)', () => {
  let dir: string;
  let root: string;
  let storage: string;
  /** The run the first test started (its run.json is checked again by the second). */
  let runJson = '';
  let runId = '';
  const savedEnv: Record<string, string | undefined> = {};
  const log = { info: () => undefined, warn: () => undefined, error: () => undefined, debug: () => undefined, trace: () => undefined };
  const globalState = new Map<string, unknown>();

  /** One window: a host on the scratch copy with the real runner, except the Lean engine (fake) and preflight (ok). */
  function newWindow(): { host: TeleleanHost; api: ReturnType<TeleleanHost['api']> } {
    stub.resetStub();
    stub.workspace.workspaceFolders = [{ uri: stub.Uri.file(path.dirname(root)), name: 'ws', index: 0 }];
    const context = {
      extensionMode: stub.ExtensionMode.Test,
      extension: { packageJSON: { version: '0.0.1' } },
      extensionUri: stub.Uri.file('/ext'),
      globalStorageUri: stub.Uri.file(storage),
      subscriptions: [],
      workspaceState: { get: () => undefined, update: async () => undefined },
      globalState: { get: (k: string) => globalState.get(k), update: async (k: string, v: unknown) => void globalState.set(k, v), keys: () => [...globalState.keys()] },
    };
    const host = new TeleleanHost(context as unknown as vscode.ExtensionContext, log as unknown as vscode.LogOutputChannel, {
      runner: {
        findModelRoots: async () => [root],
        // No Lean refresh and no git history in the model copy: only the run is under test.
        createModelWorkspace: (options) => createModelWorkspace({ ...options, semantic: { ...options.semantic, enabled: false }, git: { ...options.git, enabled: false } }),
        createRunManager: (options) =>
          createRunManager({ ...options, services: { ...options.services, engine: FAKE_ENGINE, preflight: async () => ({ ok: true }) } }),
      },
    });
    return { host, api: host.api() };
  }

  const readRun = (): PersistedView => {
    try {
      return JSON.parse(readFileSync(runJson, 'utf8')) as PersistedView;
    } catch {
      return {}; // missing, or caught between a temp write and its rename
    }
  };

  beforeAll(() => {
    for (const name of ['GIT_CONFIG_GLOBAL', 'GIT_CONFIG_NOSYSTEM', 'GIT_CEILING_DIRECTORIES', 'GIT_TERMINAL_PROMPT']) savedEnv[name] = process.env[name];
    dir = mkdtempSync(path.join(process.env.TELELEAN_TEST_TMP ?? tmpdir(), 'tl-real-runs-'));
    Object.assign(process.env, { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_CEILING_DIRECTORIES: dir, GIT_TERMINAL_PROMPT: '0' });
    root = path.join(dir, 'ws', 'model');
    storage = path.join(dir, 'globalStorage');
    cpSync(SAMPLE, root, { recursive: true, filter: (src) => !path.relative(SAMPLE, src).split(path.sep).some((part) => ['.lake', '.git', 'graph.json'].includes(part)) });
  });

  afterAll(async () => {
    for (const [name, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    if (dir) await removeScratch(dir);
  });

  it('AT5.4 end to end: in Test mode without useRunBackend the real RunManager refuses the start with the factory\'s reason and creates nothing', async () => {
    const window = newWindow();
    try {
      window.api.testing?.answerPrompts({ claudeConsent: true });
      await window.host.openBoardCommand({ root });
      await window.api.simulateBoardMessage(root, {
        v: 1,
        type: 'startRun',
        payload: { target: 'cynder-not-good', premises: ['cynder-dark-past', 'new-spyro-pg', 'pg-no-dark-past'], requestId: 'refused' },
      });
      const panel = window.api.boardFor(root)?.panel as unknown as stub.FakePanel;
      const result = (panel.posted as Array<{ type: string; payload: { requestId?: string; outcome?: { ok: boolean; code?: string; error?: string } } }>).find(
        (m) => m.type === 'actionResult' && m.payload.requestId === 'refused',
      );
      expect(result?.payload.outcome).toMatchObject({ ok: false, code: 'not-yet' });
      expect(result?.payload.outcome?.error).toContain(TEST_MODE_NO_CLAUDE);
      expect(window.api.runsFor(root)?.current()).toBeNull(); // no run was created
      const runsOfRoot = path.join(storage, 'runs', rootKeyOf(root));
      expect(existsSync(runsOfRoot) ? readdirSync(runsOfRoot) : []).toEqual([]); // no run directory, no shadow
    } finally {
      window.host.dispose();
    }
  }, 60_000);

  it('deactivating while a run works closes its session; the next window recovers it as interrupted (resumable)', async () => {
    const first = newWindow();
    const backend = new HangingBackend();
    try {
      first.api.testing?.answerPrompts({ claudeConsent: true });
      first.api.testing?.useRunBackend(() => backend);
      await first.host.openBoardCommand({ root });
      await first.api.simulateBoardMessage(root, {
        v: 1,
        type: 'startRun',
        payload: { target: 'cynder-not-good', premises: ['cynder-dark-past', 'new-spyro-pg', 'pg-no-dark-past'], requestId: 'start' },
      });
      const panel = first.api.boardFor(root)?.panel as unknown as stub.FakePanel;
      const result = (panel.posted as Array<{ type: string; payload: { requestId?: string; outcome?: unknown } }>).find(
        (m) => m.type === 'actionResult' && m.payload.requestId === 'start',
      );
      expect(result?.payload.outcome, JSON.stringify(result?.payload.outcome)).toMatchObject({ ok: true });
      const manager = first.api.runsFor(root);
      if (!manager) throw new Error('no RunManager');
      for (let i = 0; i < 200 && manager.current()?.state !== 'working'; i++) await sleep(25);
      expect(manager.current()?.state).toBe('working');
      expect(backend.sessions).toHaveLength(1);
      runId = manager.current()?.runId ?? '';
      runJson = path.join(storage, 'runs', rootKeyOf(root), runId, 'run.json');

      await first.host.shutdown(); // what extension.ts deactivate() does, before VS Code disposes the rest

      for (let i = 0; i < 200 && !backend.sessions[0]?.closed; i++) await sleep(25);
      expect(backend.sessions[0]?.closed).toBe(true);
    } finally {
      first.host.dispose();
    }
    await settled(runJson);

    // The next window: a new workspace and RunManager on the same storage; recover() brings the run back as
    // interrupted, resumable (it has a session id), and starts no session by itself.
    const second = newWindow();
    try {
      await second.host.openBoardCommand({ root });
      const recovered = second.api.runsFor(root);
      for (let i = 0; i < 200 && recovered?.current()?.runId !== runId; i++) await sleep(25);
      expect(recovered?.current()).toMatchObject({ runId, state: 'interrupted', canResume: true });
      expect(backend.sessions).toHaveLength(1);
      // The board of the new window shows it.
      const panel = second.api.boardFor(root)?.panel as unknown as stub.FakePanel;
      for (let i = 0; i < 100 && !(panel.posted as Array<{ type: string }>).some((m) => m.type === 'run'); i++) await sleep(10);
      const shown = (panel.posted as Array<{ type: string; payload: { run?: { runId: string; state: string } | null } }>).filter((m) => m.type === 'run').at(-1);
      expect(shown?.payload.run).toMatchObject({ runId, state: 'interrupted' });
    } finally {
      second.host.dispose();
    }
    // The user's real files are untouched by a run that never reached review.
    expect(readFileSync(path.join(root, 'Model', 'Spyro', 'Main.lean'), 'utf8')).toBe(readFileSync(path.join(SAMPLE, 'Model', 'Spyro', 'Main.lean'), 'utf8'));
  }, 120_000);

  it('run.json itself says interrupted once the writes queued before the deactivation have landed (docs/m2-plan.md 4.6)', async () => {
    // The first test's run, read before the second window touched it again would be ideal; the second window only
    // recovers (it rewrites run.json as interrupted itself), so start a fresh run and deactivate it here.
    const window = newWindow();
    const backend = new HangingBackend();
    try {
      window.api.testing?.answerPrompts({ claudeConsent: true });
      window.api.testing?.useRunBackend(() => backend);
      await window.host.openBoardCommand({ root });
      const manager = window.api.runsFor(root);
      if (!manager) throw new Error('no RunManager');
      for (let i = 0; i < 200 && manager.current()?.state !== 'interrupted'; i++) await sleep(25);
      await window.api.simulateBoardMessage(root, { v: 1, type: 'discardProposal', payload: { runId, requestId: 'stop' } }); // "Stop" the recovered run
      await window.api.simulateBoardMessage(root, { v: 1, type: 'dismissRun', payload: { runId } });
      await window.api.simulateBoardMessage(root, {
        v: 1,
        type: 'startRun',
        payload: { target: 'cynder-not-good', premises: ['cynder-dark-past', 'new-spyro-pg', 'pg-no-dark-past'], requestId: 'start-2' },
      });
      for (let i = 0; i < 200 && manager.current()?.state !== 'working'; i++) await sleep(25);
      expect(manager.current()?.state).toBe('working');
      runId = manager.current()?.runId ?? '';
      runJson = path.join(storage, 'runs', rootKeyOf(root), runId, 'run.json');
      await window.host.shutdown();
      await settled(runJson);
      expect(readRun().view, 'run.json after every pending write has landed').toMatchObject({ runId, state: 'interrupted', canResume: true });
    } finally {
      window.host.dispose();
    }
  }, 120_000);
});
