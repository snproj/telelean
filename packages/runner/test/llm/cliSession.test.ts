import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ClaudeCliBackend, type ClaudeCliBackendOptions, type ClaudeCliSession } from '../../src/llm/claudeCli.js';
import { GUARD_SELFTEST_SESSION } from '../../src/llm/confinement.js';
import { StubToolHost } from '../../src/llm/stubToolHost.js';
import { LlmHarnessError, type LlmEvent, type SessionConfig } from '../../src/llm/types.js';
import { makeShadow, makeTempDir, removeDir, type ShadowFixture } from './helpers.js';

const FAKE_CLI = fileURLToPath(new URL('./fixtures/fake-claude.mjs', import.meta.url));

let fx: ShadowFixture;
let recordDir: string;
let n = 0;
const sessions: ClaudeCliSession[] = [];

beforeAll(async () => {
  fx = await makeShadow();
  recordDir = await makeTempDir('telelean-cli-rec-');
});
afterEach(async () => {
  await Promise.all(sessions.splice(0).map((s) => s.close({ force: true })));
});
afterAll(async () => {
  await removeDir(fx.base);
  await removeDir(recordDir);
});

interface Rec {
  kind: string;
  pid?: number;
  argv?: string[];
  cwd?: string;
  envNames?: string[];
  line?: string;
}

function setup(env: Record<string, string> = {}, opts: Partial<ClaudeCliBackendOptions> = {}) {
  n += 1;
  const recordFile = path.join(recordDir, `record-${n}.jsonl`);
  const backend = new ClaudeCliBackend({
    binary: { path: FAKE_CLI },
    launcher: { command: process.execPath, args: [] },
    baseEnv: {
      ...process.env,
      ANTHROPIC_API_KEY: 'sk-must-not-leak',
      CLAUDECODE: '1',
      CLAUDE_CODE_SESSION_ID: 'parent-session',
      FAKE_CLAUDE_RECORD: recordFile,
      ...env,
    },
    controlTimeoutMs: 10_000,
    closeGraceMs: 2_000,
    ...opts,
  });
  const host = new StubToolHost();
  const cfg: SessionConfig = {
    cwd: fx.root,
    runDir: path.join(fx.base, `run-${n}`),
    systemPrompt: 'You are a test.',
    model: 'claude-haiku-5-5',
    maxTurns: 6,
    toolHost: host,
  };
  const records = async (): Promise<Rec[]> =>
    (await readFile(recordFile, 'utf8').catch(() => ''))
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l) as Rec);
  return { backend, host, cfg, records };
}

async function start(backend: ClaudeCliBackend, cfg: SessionConfig): Promise<ClaudeCliSession> {
  const s = await backend.startSession(cfg);
  sessions.push(s);
  return s;
}

async function collect(it: AsyncIterable<LlmEvent>): Promise<LlmEvent[]> {
  const out: LlmEvent[] = [];
  for await (const e of it) out.push(e);
  return out;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

describe('ClaudeCliBackend against a stand-in CLI', () => {
  it('passes the preflight, then runs a turn on the fixed session id', async () => {
    const { backend, cfg } = setup();
    const s = await start(backend, cfg);
    expect(s.preflightReport?.auth.verdict).toBe('subscription');
    expect(s.preflightReport?.guardSelfTest?.ok).toBe(true);
    expect(s.preflightReport?.hooks?.ok).toBe(true);
    expect(s.preflightReport?.version).toBe('2.1.314');
    const events = await collect(s.send('echo:hello'));
    expect(events.map((e) => e.type)).toEqual(['init', 'assistant_text', 'usage', 'result']);
    expect(events[0]).toMatchObject({ type: 'init', sessionId: s.launch.sessionId, permissionMode: 'dontAsk' });
    expect(events[1]).toMatchObject({ type: 'assistant_text', text: 'hello' });
    expect(events[3]).toMatchObject({ type: 'result', status: 'success', costEstimateUsd: 0.0001 });
    expect(s.sessionId).toBe(s.launch.sessionId);
  });

  it('starts the CLI with sanitised env, the confinement flags and the shadow as cwd', async () => {
    const { backend, cfg, records } = setup();
    const s = await start(backend, cfg);
    const startRec = (await records()).find((r) => r.kind === 'start');
    expect(startRec?.cwd).toBe(fx.root);
    for (const name of ['ANTHROPIC_API_KEY', 'CLAUDECODE', 'CLAUDE_CODE_SESSION_ID']) expect(startRec?.envNames).not.toContain(name);
    for (const name of ['CLAUDE_CODE_DISABLE_AUTO_MEMORY', 'ENABLE_CLAUDEAI_MCP_SERVERS', 'CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS', 'ENABLE_TOOL_SEARCH', 'FAKE_CLAUDE_RECORD']) {
      expect(startRec?.envNames).toContain(name);
    }
    expect(startRec?.argv).toEqual(s.launch.claudeArgs);
    expect(startRec?.argv).toContain('--strict-mcp-config');
    expect(s.launch.envReport.removed).toContain('ANTHROPIC_API_KEY');
    const mcp = JSON.parse(await readFile(s.launch.files.mcpConfigPath, 'utf8')) as { mcpServers: { telelean: { url: string } } };
    expect(mcp.mcpServers.telelean.url).toBe(s.toolServer.url);
  });

  it('refuses an API-key login before any prompt is sent', async () => {
    const { backend, cfg, records } = setup({ FAKE_CLAUDE_ACCOUNT: JSON.stringify({ apiProvider: 'firstParty', apiKeySource: 'ANTHROPIC_API_KEY' }) });
    const err = await backend.startSession(cfg).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LlmHarnessError);
    expect((err as LlmHarnessError).code).toBe('auth');
    const recs = await records();
    expect(recs.filter((r) => r.kind === 'stdin').some((r) => (r.line ?? '').includes('"type":"user"'))).toBe(false);
    const pid = recs.find((r) => r.kind === 'start')?.pid ?? 0;
    await sleep(200);
    expect(alive(pid)).toBe(false);
  });

  it('refuses to run when the CLI does not list the path guard (fail closed)', async () => {
    const { backend, cfg } = setup({ FAKE_CLAUDE_DROP_HOOKS: '1' });
    const err = await backend.startSession(cfg).catch((e: unknown) => e);
    expect((err as LlmHarnessError).code).toBe('confinement');
    expect((err as Error).message).toMatch(/guard is not among the hooks/);
  });

  it('reports a CLI that dies at startup with its stderr', async () => {
    const { backend, cfg } = setup({ FAKE_CLAUDE_EXIT_EARLY: '1' });
    const err = await backend.startSession(cfg).catch((e: unknown) => e);
    expect((err as LlmHarnessError).code).toBe('process');
    expect((err as Error).message).toMatch(/unknown option --bogus/);
  });

  it('runs several turns on one process', async () => {
    const { backend, cfg } = setup();
    const s = await start(backend, cfg);
    const first = await collect(s.send('echo:one'));
    const second = await collect(s.send('echo:two'));
    expect(first.filter((e) => e.type === 'init')).toHaveLength(1);
    expect(second.filter((e) => e.type === 'init')).toHaveLength(0);
    expect(second.find((e) => e.type === 'assistant_text')).toMatchObject({ text: 'two' });
    expect(() => s.send('echo:x')).not.toThrow();
    expect(() => s.send('echo:y')).toThrow(/already running/);
  });

  it('round-trips a blocking ask_user and finish through the MCP tool server', async () => {
    const { backend, cfg, host } = setup();
    host.onQuestion((q) => setTimeout(() => host.answer(q.id, { answers: [{ question: 0, choice: { kind: 'option', option: 1 } }], answeredAt: 'now' }), 2_000));
    const s = await start(backend, cfg);
    const started = Date.now();
    const events = await collect(s.send('ask'));
    expect(Date.now() - started).toBeGreaterThanOrEqual(1_900);
    const results = events.filter((e): e is Extract<LlmEvent, { type: 'tool_result' }> => e.type === 'tool_result');
    expect(results[0]?.text).toContain('option 1: Fact');
    expect(results[1]?.text).toContain('Gate passed');
    expect(events.at(-1)).toMatchObject({ type: 'result', status: 'success' });
    expect(host.calls.map((c) => c.tool)).toEqual(['ask_user', 'finish']);
  });

  it('runs the generated PreToolUse hook the way the CLI does: outside reads denied, inside reads allowed', async () => {
    const { backend, cfg } = setup();
    const s = await start(backend, cfg);
    const denied = await collect(s.send('read:/etc/hostname'));
    expect(denied.find((e) => e.type === 'permission_denied')).toBeDefined();
    expect(denied.find((e) => e.type === 'tool_result')).toMatchObject({ isError: true });
    expect((denied.find((e) => e.type === 'tool_result') as { text: string }).text).toMatch(/outside the workspace copy/);
    const allowed = await collect(s.send(`read:${path.join(fx.root, 'Model.lean')}`));
    expect(allowed.find((e) => e.type === 'tool_result')).toMatchObject({ isError: false, text: 'import Model.Spyro.Main\n' });
    const log = (await readFile(s.launch.files.logPath, 'utf8'))
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l) as { decision: string; session_id?: string });
    // The backend's pre-launch self-test logs under its own session id, before the CLI's calls.
    expect(log.filter((l) => l.session_id === GUARD_SELFTEST_SESSION).map((l) => l.decision)).toEqual(['deny', 'pass']);
    expect(log.filter((l) => l.session_id !== GUARD_SELFTEST_SESSION).map((l) => l.decision)).toEqual(['deny', 'pass']);
  });

  it('runs the guard as installed on synthetic calls before starting the CLI', async () => {
    const { backend, cfg } = setup();
    const s = await start(backend, cfg);
    const selfTest = s.preflightReport?.guardSelfTest;
    expect(selfTest?.ok).toBe(true);
    expect(selfTest?.probes.map((p) => [p.name, p.outcome])).toEqual([
      ['outside', 'deny'],
      ['inside', 'pass'],
    ]);
  });

  it('refuses to start, without starting the CLI, when the hook command cannot run', async () => {
    const { backend, cfg, records } = setup({}, { hookRuntime: { command: path.join(fx.base, 'no-such-node'), args: [] } });
    const err = await backend.startSession(cfg).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LlmHarnessError);
    expect((err as LlmHarnessError).code).toBe('confinement');
    expect((err as Error).message).toMatch(/path guard does not work as installed.*cannot start/);
    expect((await records()).some((r) => r.kind === 'start')).toBe(false);
  });

  it('refuses to start when the installed hook does not deny an outside read', async () => {
    // A hook command that runs but ignores the guard script: exits 0 and prints nothing.
    const { backend, cfg, records } = setup({}, { hookRuntime: { command: process.execPath, args: ['-e', 'process.exit(0)'] } });
    const err = await backend.startSession(cfg).catch((e: unknown) => e);
    expect((err as LlmHarnessError).code).toBe('confinement');
    expect((err as Error).message).toMatch(/outside probe .* should be denied but the hook let it pass/);
    expect((await records()).some((r) => r.kind === 'start')).toBe(false);
  });

  it('interrupt() ends the running turn and keeps the session usable', async () => {
    const { backend, cfg } = setup();
    const s = await start(backend, cfg);
    const events: LlmEvent[] = [];
    for await (const e of s.send('hang')) {
      events.push(e);
      if (e.type === 'assistant_text') await s.interrupt();
    }
    expect(events.at(-1)).toMatchObject({ type: 'result', status: 'interrupted' });
    const next = await collect(s.send('echo:still here'));
    expect(next.find((e) => e.type === 'assistant_text')).toMatchObject({ text: 'still here' });
  });

  it('close() ends the whole process group, grandchildren included', async () => {
    const { backend, cfg, records } = setup();
    const s = await start(backend, cfg);
    const it = s.send('spawn-grandchild')[Symbol.asyncIterator]();
    while (!((await it.next()).value?.type === 'assistant_text'));
    const grandchild = (await records()).find((r) => r.kind === 'grandchild')?.pid ?? 0;
    expect(grandchild).toBeGreaterThan(0);
    expect(alive(grandchild)).toBe(true);
    await s.close({ force: true });
    await sleep(300);
    expect(alive(grandchild)).toBe(false);
    expect(s.hasExited).toBe(true);
  });

  it('a graceful close() sends end_session and stops the tool server', async () => {
    const { backend, cfg, records } = setup();
    const s = await start(backend, cfg);
    await collect(s.send('echo:bye'));
    await s.close();
    const lines = (await records()).filter((r) => r.kind === 'stdin').map((r) => r.line ?? '');
    expect(lines.some((l) => l.includes('"subtype":"end_session"'))).toBe(true);
    await expect(fetch(s.toolServer.url)).rejects.toThrow();
  });

  it('a CLI killed during ask_user (window reload) orphans the question and ends the turn', async () => {
    const { backend, cfg, host } = setup();
    const s = await start(backend, cfg);
    host.onQuestion(() => setTimeout(() => s.killProcessTree('SIGTERM'), 200));
    const events = await collect(s.send('ask'));
    expect(events.at(-1)).toMatchObject({ type: 'error', fatal: true, code: 'process' });
    await sleep(300);
    expect(host.pendingQuestions().map((q) => q.state)).toEqual(['orphaned']);
    await expect(fetch(s.toolServer.url)).rejects.toThrow();
  });

  it('resumes a session by id', async () => {
    const { backend, cfg } = setup();
    const s = await start(backend, { ...cfg, resumeSessionId: 'resumed-session-1' });
    expect(s.launch.claudeArgs).toContain('--resume');
    expect(s.launch.claudeArgs).not.toContain('--session-id');
    const events = await collect(s.send('echo:back'));
    expect(events[0]).toMatchObject({ type: 'init', sessionId: 'resumed-session-1' });
  });

  it('stops the run if the init message reports an API key after all', async () => {
    const { backend, cfg } = setup({ FAKE_CLAUDE_API_KEY_SOURCE: 'ANTHROPIC_API_KEY' });
    const s = await start(backend, cfg);
    const events = await collect(s.send('echo:x'));
    expect(events.find((e) => e.type === 'error')).toMatchObject({ fatal: true, code: 'auth' });
    await s.exited;
    expect(s.hasExited).toBe(true);
  });
});
