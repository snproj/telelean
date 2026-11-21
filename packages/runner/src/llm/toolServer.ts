// The AgentToolHost served to the Claude Code CLI as MCP tools over loopback HTTP (03 §8.2).
//
// Why HTTP in-process rather than a stdio bridge: the host lives in the extension-host process,
// so an HTTP server there calls it directly; a stdio server would be a separate process that the
// CLI spawns and that would need its own channel back to the host anyway.
//
// Safety: bound to 127.0.0.1 on a random port; every request needs the per-run bearer token
// (constant-time compare); the Host header must name the loopback address (DNS rebinding) and
// browser Origin headers are refused.
//
// Long waits (ask_user): the CLI's per-server `timeout` (set to one day in the generated config)
// is both the hard limit and the floor of its idle timeout, whose default for HTTP servers is
// 5 minutes; the SDK transport writes SSE keep-alive comments every 15 s; and while a call is
// pending the server sends MCP progress notifications when the client supplied a progress token.

import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest, type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { TOOL_CALL_TIMEOUT_MS } from './env.js';
import {
  TOOL_DESCRIPTIONS,
  TOOL_META,
  TOOL_SERVER_NAME,
  TOOL_TITLES,
  renderAdoption,
  renderArrowProposal,
  renderAnswers,
  renderCheckResult,
  renderFreezeResult,
  renderGateVerdict,
  toolInputShapes,
} from './toolSchemas.js';
import type { AgentToolHost, AgentToolName, ToolCallContext } from './types.js';

export interface ToolServerLogEntry {
  ts: string;
  kind: 'http' | 'session' | 'call' | 'result' | 'error' | 'progress';
  detail: Record<string, unknown>;
}

export interface ToolServerOptions {
  host: AgentToolHost;
  /** 0 (default) picks a free port. */
  port?: number;
  /** Bearer token; default 32 random bytes. */
  token?: string;
  /** Interval of MCP progress notifications while a call is pending (default 30 s; 0 = off). */
  progressIntervalMs?: number;
  /** Per-server tool-call timeout written into the CLI's MCP config (default one day). */
  toolTimeoutMs?: number;
  /**
   * Mark a final finish result (accept or give_up, never retry) with `_meta["claude/endTurn"]`,
   * which the CLI (2.1.314 knows the key) may use to end the turn without another model request.
   * Unverified until the live smoke test; default off.
   */
  endTurnOnFinish?: boolean;
  onLog?: (entry: ToolServerLogEntry) => void;
}

/** One entry of the CLI's --mcp-config file. */
export interface McpHttpServerConfig {
  type: 'http';
  url: string;
  headers: Record<string, string>;
  timeout: number;
  alwaysLoad: true;
}

export interface ToolServer {
  readonly url: string;
  readonly port: number;
  readonly token: string;
  /** Tool calls currently waiting for the host. */
  readonly activeCalls: number;
  mcpServerConfig(): McpHttpServerConfig;
  /** The whole --mcp-config document. It contains the bearer token: write it with mode 0600. */
  mcpConfigDocument(): { mcpServers: Record<string, McpHttpServerConfig> };
  close(): Promise<void>;
}

const MAX_BODY_BYTES = 4 * 1024 * 1024;

type Extra = {
  signal: AbortSignal;
  sessionId?: string | undefined;
  requestId: string | number;
  _meta?: { progressToken?: string | number | undefined } | undefined;
  sendNotification: (n: {
    method: 'notifications/progress';
    params: { progressToken: string | number; progress: number; message?: string };
  }) => Promise<void>;
};

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('request body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function plain(res: http.ServerResponse, status: number, message: string): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message }, id: null }));
}

export async function startToolServer(opts: ToolServerOptions): Promise<ToolServer> {
  const token = opts.token ?? randomBytes(32).toString('hex');
  const expected = Buffer.from(`Bearer ${token}`);
  const progressIntervalMs = opts.progressIntervalMs ?? 30_000;
  const toolTimeoutMs = opts.toolTimeoutMs ?? TOOL_CALL_TIMEOUT_MS;
  const sessions = new Map<string, { transport: StreamableHTTPServerTransport; server: McpServer }>();
  let activeCalls = 0;
  let port = 0;

  const log = (kind: ToolServerLogEntry['kind'], detail: Record<string, unknown>): void => {
    opts.onLog?.({ ts: new Date().toISOString(), kind, detail });
  };

  const tokenOk = (header: string | undefined): boolean => {
    if (header === undefined) return false;
    const given = Buffer.from(header);
    return given.length === expected.length && timingSafeEqual(given, expected);
  };

  const startProgress = (tool: AgentToolName, extra: Extra): (() => void) => {
    const progressToken = extra._meta?.progressToken;
    if (progressToken === undefined || progressIntervalMs <= 0) return () => {};
    let progress = 0;
    const timer = setInterval(() => {
      progress += 1;
      const message = tool === 'ask_user' ? 'waiting for the user to answer' : `running ${tool}`;
      extra
        .sendNotification({ method: 'notifications/progress', params: { progressToken, progress, message } })
        .then(() => log('progress', { tool, progress }))
        .catch(() => {});
    }, progressIntervalMs);
    timer.unref();
    return () => clearInterval(timer);
  };

  async function runTool<R>(
    tool: AgentToolName,
    extra: Extra,
    call: (ctx: ToolCallContext) => Promise<R>,
    render: (r: R) => string,
    meta?: (r: R) => Record<string, unknown> | undefined,
  ): Promise<CallToolResult> {
    activeCalls += 1;
    const ctx: ToolCallContext = { signal: extra.signal, requestId: extra.requestId };
    if (extra.sessionId !== undefined) ctx.transportSessionId = extra.sessionId;
    const stop = startProgress(tool, extra);
    log('call', { tool, requestId: extra.requestId, transportSession: extra.sessionId });
    try {
      const result = await call(ctx);
      log('result', { tool, requestId: extra.requestId });
      const resultMeta = meta?.(result);
      return { content: [{ type: 'text', text: render(result) }], ...(resultMeta ? { _meta: resultMeta } : {}) };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log('error', { tool, requestId: extra.requestId, message });
      return { isError: true, content: [{ type: 'text', text: `telelean ${tool} failed: ${message}` }] };
    } finally {
      stop();
      activeCalls -= 1;
    }
  }

  const createMcpServer = (): McpServer => {
    const server = new McpServer({ name: TOOL_SERVER_NAME, version: '0.0.0' }, { capabilities: { tools: {} } });
    const host = opts.host;
    const config = (tool: AgentToolName) => ({
      title: TOOL_TITLES[tool],
      description: TOOL_DESCRIPTIONS[tool],
      _meta: TOOL_META[tool],
    });
    server.registerTool('ask_user', { ...config('ask_user'), inputSchema: toolInputShapes.ask_user }, (args, extra) =>
      runTool('ask_user', extra as Extra, (ctx) => host.ask_user(args, ctx), (r) => renderAnswers(args, r)),
    );
    server.registerTool('check_lean', { ...config('check_lean'), inputSchema: toolInputShapes.check_lean }, (args, extra) =>
      runTool('check_lean', extra as Extra, (ctx) => host.check_lean(args, ctx), renderCheckResult),
    );
    server.registerTool(
      'freeze_statements',
      { ...config('freeze_statements'), inputSchema: toolInputShapes.freeze_statements },
      (args, extra) =>
        runTool('freeze_statements', extra as Extra, (ctx) => host.freeze_statements(args, ctx), renderFreezeResult),
    );
    server.registerTool(
      'propose_assumption',
      { ...config('propose_assumption'), inputSchema: toolInputShapes.propose_assumption },
      (args, extra) =>
        runTool('propose_assumption', extra as Extra, (ctx) => host.propose_assumption(args, ctx), renderAdoption),
    );
    server.registerTool('propose_arrow', { ...config('propose_arrow'), inputSchema: toolInputShapes.propose_arrow }, (args, extra) =>
      runTool('propose_arrow', extra as Extra, (ctx) => host.propose_arrow(args, ctx), renderArrowProposal),
    );
    server.registerTool('finish', { ...config('finish'), inputSchema: toolInputShapes.finish }, (args, extra) =>
      runTool('finish', extra as Extra, (ctx) => host.finish(args, ctx), renderGateVerdict, (v) =>
        opts.endTurnOnFinish && v.next !== 'retry' ? { 'claude/endTurn': true } : undefined,
      ),
    );
    return server;
  };

  const handle = async (req: http.IncomingMessage, res: http.ServerResponse): Promise<void> => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    log('http', { method: req.method, path: url.pathname });
    if (url.pathname !== '/mcp') return plain(res, 404, 'not found');
    const hostHeader = req.headers.host;
    if (hostHeader !== `127.0.0.1:${port}` && hostHeader !== `localhost:${port}`) {
      return plain(res, 403, 'unexpected Host header');
    }
    if (req.headers.origin !== undefined) return plain(res, 403, 'browser requests are not allowed');
    if (!tokenOk(req.headers.authorization)) return plain(res, 401, 'missing or wrong bearer token');

    const sessionHeader = req.headers['mcp-session-id'];
    const sessionId = Array.isArray(sessionHeader) ? sessionHeader[0] : sessionHeader;

    if (req.method === 'POST') {
      let body: unknown;
      try {
        body = JSON.parse(await readBody(req));
      } catch (err) {
        return plain(res, 400, `invalid JSON body: ${(err as Error).message}`);
      }
      if (sessionId !== undefined) {
        const existing = sessions.get(sessionId);
        if (!existing) return plain(res, 404, 'session not found');
        return existing.transport.handleRequest(req, res, body);
      }
      if (!isInitializeRequest(body)) return plain(res, 400, 'no session id and not an initialize request');
      const server = createMcpServer();
      const transport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => {
          sessions.set(id, { transport, server });
          log('session', { event: 'open', session: id });
        },
      });
      transport.onclose = () => {
        if (transport.sessionId !== undefined && sessions.delete(transport.sessionId)) {
          log('session', { event: 'close', session: transport.sessionId });
        }
      };
      await server.connect(transport);
      return transport.handleRequest(req, res, body);
    }
    if (req.method === 'GET' || req.method === 'DELETE') {
      const existing = sessionId !== undefined ? sessions.get(sessionId) : undefined;
      if (!existing) return plain(res, sessionId !== undefined ? 404 : 400, 'session not found');
      return existing.transport.handleRequest(req, res);
    }
    return plain(res, 405, 'method not allowed');
  };

  const httpServer = http.createServer((req, res) => {
    handle(req, res).catch((err: unknown) => {
      log('error', { message: err instanceof Error ? err.message : String(err) });
      if (!res.headersSent) plain(res, 500, 'internal error');
      else res.end();
    });
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(opts.port ?? 0, '127.0.0.1', () => {
      httpServer.off('error', reject);
      resolve();
    });
  });
  port = (httpServer.address() as AddressInfo).port;
  const url = `http://127.0.0.1:${port}/mcp`;

  const mcpServerConfig = (): McpHttpServerConfig => ({
    type: 'http',
    url,
    headers: { Authorization: `Bearer ${token}` },
    timeout: toolTimeoutMs,
    alwaysLoad: true,
  });
  let closed: Promise<void> | undefined;
  return {
    url,
    port,
    token,
    get activeCalls() {
      return activeCalls;
    },
    mcpServerConfig,
    mcpConfigDocument: () => ({ mcpServers: { [TOOL_SERVER_NAME]: mcpServerConfig() } }),
    close() {
      closed ??= (async () => {
        await Promise.allSettled([...sessions.values()].map((s) => s.transport.close()));
        sessions.clear();
        await new Promise<void>((resolve) => {
          httpServer.close(() => resolve());
          httpServer.closeAllConnections();
        });
      })();
      return closed;
    },
  };
}
