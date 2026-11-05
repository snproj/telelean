import http from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterEach, describe, expect, it } from 'vitest';
import { StubToolHost } from '../../src/llm/stubToolHost.js';
import { startToolServer, type ToolServer, type ToolServerLogEntry } from '../../src/llm/toolServer.js';
import type { AgentToolHost, Answers, AskUserArgs } from '../../src/llm/types.js';

const QUESTION: AskUserArgs = {
  questions: [
    {
      phenomenon: 'modality',
      question: 'Does "PG games cannot have gore" state a rule or a fact?',
      options: [
        { label: 'A rule', consequence: 'Read as a norm the ratings board enforces' },
        { label: 'A fact', consequence: 'Read as a regularity of the world' },
      ],
      claudesGuess: { option: 0 },
      affectedNodes: ['a1'],
    },
  ],
};
const ANSWERS: Answers = { answers: [{ question: 0, choice: { kind: 'option', option: 0 }, scope: 'run' }], answeredAt: '2026-11-01T00:00:00Z' };

let server: ToolServer | undefined;
let client: Client | undefined;
afterEach(async () => {
  await client?.close().catch(() => {});
  await server?.close();
  client = undefined;
  server = undefined;
});

async function connect(host: AgentToolHost, logs: ToolServerLogEntry[] = [], progressIntervalMs = 2_000) {
  server = await startToolServer({ host, progressIntervalMs, onLog: (e) => logs.push(e) });
  const transport = new StreamableHTTPClientTransport(new URL(server.url), {
    requestInit: { headers: { Authorization: `Bearer ${server.token}` } },
  });
  client = new Client({ name: 'telelean-test', version: '0.0.0' });
  await client.connect(transport);
  return { server, client };
}

const text = (r: unknown): string => {
  const content = (r as { content?: Array<{ type: string; text?: string }> }).content ?? [];
  return content.map((c) => c.text ?? '').join('\n');
};

describe('tool server (MCP over loopback HTTP)', () => {
  it('lists the five agent tools with schemas and the always-load meta', async () => {
    const { client: c } = await connect(new StubToolHost());
    const { tools } = await c.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(['ask_user', 'check_lean', 'finish', 'freeze_statements', 'propose_assumption']);
    const finish = tools.find((t) => t.name === 'finish');
    expect(finish?.inputSchema.required).toEqual(expect.arrayContaining(['status', 'summary', 'assumed_without_asking']));
    expect(finish?._meta?.['anthropic/alwaysLoad']).toBe(true);
    const ask = tools.find((t) => t.name === 'ask_user');
    expect(JSON.stringify(ask?.inputSchema)).toContain('phenomenon');
    expect(ask?._meta?.['anthropic/requiresUserInteraction']).toBeUndefined(); // would be denied under dontAsk
  });

  it('writes the CLI config entry with bearer token, one-day timeout and alwaysLoad', async () => {
    const { server: s } = await connect(new StubToolHost());
    expect(s.mcpConfigDocument()).toEqual({
      mcpServers: {
        telelean: {
          type: 'http',
          url: s.url,
          headers: { Authorization: `Bearer ${s.token}` },
          timeout: 86_400_000,
          alwaysLoad: true,
        },
      },
    });
    expect(s.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/mcp$/);
    expect(s.token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('ask_user blocks for 30 s until the host answers, with progress notifications meanwhile', async () => {
    const host = new StubToolHost();
    const logs: ToolServerLogEntry[] = [];
    const { client: c, server: s } = await connect(host, logs, 2_000);
    const asked: string[] = [];
    host.onQuestion((q) => {
      asked.push(q.id);
      setTimeout(() => host.answer(q.id, ANSWERS), 30_000);
    });
    const progress: number[] = [];
    const started = Date.now();
    const pending = c.callTool({ name: 'ask_user', arguments: { ...QUESTION } }, undefined, {
      timeout: 120_000,
      onprogress: (p) => progress.push(p.progress),
    });
    await new Promise((r) => setTimeout(r, 1_000));
    expect(s.activeCalls).toBe(1);
    const result = await pending;
    const elapsed = Date.now() - started;
    expect(elapsed).toBeGreaterThanOrEqual(29_500);
    expect(asked).toHaveLength(1);
    expect(text(result)).toContain('The user answered:');
    expect(text(result)).toContain('option 0: A rule');
    expect(text(result)).toContain('[scope: run]');
    expect(progress.length).toBeGreaterThanOrEqual(10);
    expect(logs.some((l) => l.kind === 'progress')).toBe(true);
    expect(s.activeCalls).toBe(0);
  }, 90_000);

  it('sends SSE response headers at once for a pending call (the CLI first-byte timer is 60 s)', async () => {
    const host = new StubToolHost();
    server = await startToolServer({ host });
    const base = { authorization: `Bearer ${server.token}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' };
    const init = await fetch(server.url, {
      method: 'POST',
      headers: base,
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'raw', version: '0' } } }),
    });
    const session = init.headers.get('mcp-session-id') ?? '';
    await init.text();
    const headers = { ...base, 'mcp-session-id': session, 'mcp-protocol-version': '2025-06-18' };
    await (await fetch(server.url, { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) })).text();
    host.onQuestion((q) => setTimeout(() => host.answer(q.id, ANSWERS), 3_000));
    const t0 = Date.now();
    const res = await fetch(server.url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'ask_user', arguments: QUESTION } }),
    });
    expect(Date.now() - t0).toBeLessThan(1_500);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const body = await res.text();
    expect(Date.now() - t0).toBeGreaterThanOrEqual(2_900);
    expect(body).toContain('The user answered');
  });

  it('a cancelled ask_user call orphans the question (its answer then goes in the next user turn)', async () => {
    const host = new StubToolHost();
    const { client: c } = await connect(host);
    const abort = new AbortController();
    let questionId = '';
    host.onQuestion((q) => {
      questionId = q.id;
      setTimeout(() => abort.abort(), 300);
    });
    await expect(c.callTool({ name: 'ask_user', arguments: { ...QUESTION } }, undefined, { signal: abort.signal, timeout: 30_000 })).rejects.toThrow();
    await new Promise((r) => setTimeout(r, 300));
    expect(host.pendingQuestions().map((q) => q.state)).toEqual(['orphaned']);
    expect(host.answer(questionId, ANSWERS)).toBe(false);
  });

  it('finish runs the gate: retry with failures, then give up at the cap', async () => {
    const host = new StubToolHost(() => [{ check: 'no_sorry', detail: 'cynder_not_good.holds uses sorry' }], 2);
    const { client: c } = await connect(host);
    const args = { status: 'proved', summary: 'done', assumed_without_asking: [] };
    const first = text(await c.callTool({ name: 'finish', arguments: args }));
    expect(first).toContain('Gate failed (attempt 1 of 2)');
    expect(first).toContain('no_sorry: cynder_not_good.holds uses sorry');
    const second = text(await c.callTool({ name: 'finish', arguments: args }));
    expect(second).toContain('attempt limit (2) is reached');
    expect(host.finishes.map((f) => f.verdict.next)).toEqual(['retry', 'give_up']);
  });

  it('marks only a final finish with claude/endTurn when asked to', async () => {
    let failuresLeft = 1;
    const host = new StubToolHost(() => (failuresLeft-- > 0 ? [{ check: 'footprint', detail: 'uses an unselected assumption' }] : []), 3);
    server = await startToolServer({ host, endTurnOnFinish: true });
    client = new Client({ name: 't', version: '0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(server.url), { requestInit: { headers: { Authorization: `Bearer ${server.token}` } } }));
    const args = { status: 'proved', summary: 'ok', assumed_without_asking: [] };
    const retry = await client.callTool({ name: 'finish', arguments: args });
    expect(retry._meta?.['claude/endTurn']).toBeUndefined();
    const accept = await client.callTool({ name: 'finish', arguments: args });
    expect(accept._meta?.['claude/endTurn']).toBe(true);
    expect(text(accept)).toContain('Gate passed');
  });

  it('accepts a passing finish and stub Lean tools; reports host errors as tool errors', async () => {
    const host = new StubToolHost();
    const failing: AgentToolHost = Object.assign(Object.create(host) as AgentToolHost, {
      check_lean: async () => {
        throw new Error('lake build crashed');
      },
    });
    const { client: c } = await connect(failing);
    expect(text(await c.callTool({ name: 'finish', arguments: { status: 'proved', summary: 'ok', assumed_without_asking: [] } }))).toContain('Gate passed');
    expect(text(await c.callTool({ name: 'freeze_statements', arguments: { targets: ['g1'] } }))).toContain('Statements frozen');
    const broken = await c.callTool({ name: 'check_lean', arguments: {} });
    expect(broken.isError).toBe(true);
    expect(text(broken)).toContain('lake build crashed');
    const invalid = await c.callTool({ name: 'freeze_statements', arguments: { targets: [] } });
    expect(invalid.isError).toBe(true);
  });

  it('refuses requests without the right token, with a foreign Host, or from a browser origin', async () => {
    const { server: s } = await connect(new StubToolHost());
    const init = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'x', version: '0' } } });
    const post = (headers: Record<string, string>) =>
      new Promise<number>((resolve, reject) => {
        const req = http.request(s.url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers } }, (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        });
        req.on('error', reject);
        req.end(init);
      });
    expect(await post({})).toBe(401);
    expect(await post({ authorization: 'Bearer wrong' })).toBe(401);
    expect(await post({ authorization: `Bearer ${s.token}`, host: 'evil.example:80' })).toBe(403);
    expect(await post({ authorization: `Bearer ${s.token}`, origin: 'http://evil.example' })).toBe(403);
    expect(await post({ authorization: `Bearer ${s.token}` })).toBe(200);
    const notFound = await fetch(s.url.replace('/mcp', '/other'), { headers: { authorization: `Bearer ${s.token}` } });
    expect(notFound.status).toBe(404);
  });
});
