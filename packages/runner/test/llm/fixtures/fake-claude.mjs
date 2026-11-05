#!/usr/bin/env node
// A stand-in for the Claude Code CLI in `-p --input-format stream-json --output-format stream-json`
// mode, for offline tests of ClaudeCliBackend. It never contacts anything but the test's own
// loopback MCP server. It speaks enough of the protocol to exercise the session plumbing:
//   control requests: initialize (account), get_hooks_listing (from --settings), interrupt, end_session
//   user turns:  "echo:<text>"   assistant text + result
//                "ask"           calls mcp__telelean__ask_user then finish over the real MCP server
//                "read:<path>"   runs the PreToolUse hook from --settings like the CLI does, then reads
//                "hang"          waits until interrupted or killed
//                "spawn-grandchild"  starts `sleep 300` in its process group, then hangs
// Behaviour switches (environment): FAKE_CLAUDE_RECORD (JSONL record file), FAKE_CLAUDE_ACCOUNT
// (JSON), FAKE_CLAUDE_DROP_HOOKS=1, FAKE_CLAUDE_API_KEY_SOURCE, FAKE_CLAUDE_EXIT_EARLY=1.

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { appendFileSync, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const record = (obj) => {
  if (process.env.FAKE_CLAUDE_RECORD) appendFileSync(process.env.FAKE_CLAUDE_RECORD, `${JSON.stringify(obj)}\n`);
};
const out = (obj) => process.stdout.write(`${JSON.stringify(obj)}\n`);

record({ kind: 'start', pid: process.pid, argv, cwd: process.cwd(), envNames: Object.keys(process.env).sort() });

if (process.env.FAKE_CLAUDE_EXIT_EARLY === '1') {
  process.stderr.write('Error: unknown option --bogus\n');
  process.exit(1);
}

const sessionId = flag('--resume') ?? flag('--session-id') ?? randomUUID();
const model = flag('--model') ?? 'fake-model';
const settings = JSON.parse(readFileSync(flag('--settings'), 'utf8'));
const mcpConfig = JSON.parse(readFileSync(flag('--mcp-config'), 'utf8'));
let initSent = false;
let msgSeq = 0;
let turn; // { abort: AbortController }

function hooksListing() {
  if (process.env.FAKE_CLAUDE_DROP_HOOKS === '1') return { events: [], hooks: [], policy: { allDisabled: false } };
  const hooks = [];
  for (const entry of settings.hooks?.PreToolUse ?? []) {
    for (const h of entry.hooks ?? []) {
      hooks.push({
        event: 'PreToolUse',
        matcher: entry.matcher ?? '',
        source: 'flagSettings',
        sourceLabel: '--settings',
        type: h.type,
        displayText: [h.command, ...(h.args ?? [])].join(' '),
        commandText: [h.command, ...(h.args ?? [])].join(' '),
        timeout: h.timeout,
      });
    }
  }
  return { events: [], hooks, policy: { disabledByPolicy: false, managedOnly: false, pluginOnly: false, allDisabled: settings.disableAllHooks === true } };
}

function sendInit() {
  if (initSent) return;
  initSent = true;
  out({
    type: 'system',
    subtype: 'init',
    uuid: randomUUID(),
    session_id: sessionId,
    apiKeySource: process.env.FAKE_CLAUDE_API_KEY_SOURCE ?? 'none',
    claude_code_version: '2.1.314',
    cwd: process.cwd(),
    tools: ['Read', 'Glob', 'Grep', 'Edit', 'Write', 'mcp__telelean__ask_user', 'mcp__telelean__finish'],
    mcp_servers: [{ name: 'telelean', status: 'connected' }],
    model,
    permissionMode: flag('--permission-mode') ?? 'default',
  });
}

const usage = { input_tokens: 12, output_tokens: 7, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
function assistant(content) {
  msgSeq += 1;
  out({ type: 'assistant', uuid: randomUUID(), session_id: sessionId, parent_tool_use_id: null, message: { id: `msg_${msgSeq}`, model, role: 'assistant', content, usage } });
}
function toolResult(id, text, isError = false) {
  out({ type: 'user', uuid: randomUUID(), session_id: sessionId, parent_tool_use_id: null, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, is_error: isError, content: [{ type: 'text', text }] }] } });
}
function result(subtype = 'success', extra = {}) {
  out({
    type: 'result',
    subtype,
    uuid: randomUUID(),
    session_id: sessionId,
    duration_ms: 5,
    duration_api_ms: 1,
    is_error: subtype !== 'success',
    num_turns: 1,
    result: 'done',
    stop_reason: 'end_turn',
    total_cost_usd: 0.0001,
    usage,
    modelUsage: { [model]: { inputTokens: 12, outputTokens: 7, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, webSearchRequests: 0, costUSD: 0.0001, contextWindow: 200000, maxOutputTokens: 32000 } },
    permission_denials: [],
    ...extra,
  });
}

async function mcpClient() {
  const cfg = mcpConfig.mcpServers.telelean;
  const transport = new StreamableHTTPClientTransport(new URL(cfg.url), { requestInit: { headers: cfg.headers } });
  const client = new Client({ name: 'fake-claude', version: '0.0.0' });
  await client.connect(transport);
  return client;
}

function runHook(toolName, toolInput, toolUseId) {
  const hook = settings.hooks?.PreToolUse?.[0]?.hooks?.[0];
  if (!hook) return Promise.resolve({ decision: 'none' });
  return new Promise((resolve) => {
    const child = spawn(hook.command, hook.args ?? [], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('close', (code) => {
      if (code === 2) return resolve({ decision: 'deny', reason: stderr.trim() });
      if (code !== 0) return resolve({ decision: hook.onFailure === 'block' ? 'deny' : 'none', reason: `hook failed (${code})` });
      if (stdout.trim() === '') return resolve({ decision: 'none' });
      const parsed = JSON.parse(stdout);
      const spec = parsed.hookSpecificOutput ?? {};
      resolve({ decision: spec.permissionDecision ?? 'none', reason: spec.permissionDecisionReason });
    });
    child.stdin.end(JSON.stringify({ session_id: sessionId, cwd: process.cwd(), permission_mode: 'dontAsk', hook_event_name: 'PreToolUse', tool_name: toolName, tool_input: toolInput, tool_use_id: toolUseId }));
  });
}

const waitForAbort = (signal) => new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true }));

async function runTurn(text, signal) {
  sendInit();
  if (text.startsWith('echo:')) {
    assistant([{ type: 'text', text: text.slice(5) }]);
    return result();
  }
  if (text === 'ask') {
    const client = await mcpClient();
    try {
      assistant([{ type: 'tool_use', id: 'toolu_ask', name: 'mcp__telelean__ask_user', input: {} }]);
      const args = {
        questions: [
          {
            phenomenon: 'modality',
            question: 'Rule or fact?',
            options: [
              { label: 'Rule', consequence: 'normative reading' },
              { label: 'Fact', consequence: 'descriptive reading' },
            ],
          },
        ],
      };
      const answered = await client.callTool({ name: 'ask_user', arguments: args }, undefined, { timeout: 600_000, signal });
      toolResult('toolu_ask', answered.content.map((c) => c.text).join('\n'), answered.isError === true);
      assistant([{ type: 'tool_use', id: 'toolu_finish', name: 'mcp__telelean__finish', input: {} }]);
      const finished = await client.callTool({ name: 'finish', arguments: { status: 'proved', summary: 'ok', assumed_without_asking: [] } });
      toolResult('toolu_finish', finished.content.map((c) => c.text).join('\n'), finished.isError === true);
      return result();
    } finally {
      await client.close();
    }
  }
  if (text.startsWith('read:')) {
    const filePath = text.slice(5);
    const id = `toolu_read_${msgSeq + 1}`;
    assistant([{ type: 'tool_use', id, name: 'Read', input: { file_path: filePath } }]);
    const verdict = await runHook('Read', { file_path: filePath }, id);
    if (verdict.decision === 'deny') {
      out({ type: 'system', subtype: 'permission_denied', tool_name: 'Read', tool_use_id: id, message: verdict.reason });
      toolResult(id, verdict.reason ?? 'denied', true);
    } else {
      toolResult(id, readFileSync(filePath, 'utf8'));
    }
    return result();
  }
  if (text === 'hang' || text === 'spawn-grandchild') {
    if (text === 'spawn-grandchild') {
      const child = spawn('sleep', ['300'], { stdio: 'ignore' });
      record({ kind: 'grandchild', pid: child.pid });
    }
    assistant([{ type: 'text', text: 'working…' }]);
    await waitForAbort(signal);
    return result('error_during_execution', { terminal_reason: 'aborted_by_interrupt', errors: ['interrupted'] });
  }
  assistant([{ type: 'text', text: `unknown command: ${text}` }]);
  return result();
}

const rl = createInterface({ input: process.stdin });
rl.on('line', (line) => {
  record({ kind: 'stdin', line });
  const msg = JSON.parse(line);
  if (msg.type === 'control_request') {
    const { subtype } = msg.request;
    const ok = (response = {}) => out({ type: 'control_response', response: { subtype: 'success', request_id: msg.request_id, response } });
    if (subtype === 'initialize') {
      const account = process.env.FAKE_CLAUDE_ACCOUNT ? JSON.parse(process.env.FAKE_CLAUDE_ACCOUNT) : { apiProvider: 'firstParty', subscriptionType: 'max', email: 'fake@example.com' };
      return ok({ commands: [], agents: [], output_style: 'default', available_output_styles: [], models: [], account, claude_code_version: '2.1.314' });
    }
    if (subtype === 'get_hooks_listing') return ok(hooksListing());
    if (subtype === 'interrupt') {
      turn?.abort.abort();
      return ok({ still_queued: [] });
    }
    if (subtype === 'end_session') {
      ok();
      turn?.abort.abort();
      setTimeout(() => process.exit(0), 20);
      return;
    }
    return out({ type: 'control_response', response: { subtype: 'error', request_id: msg.request_id, error: `unsupported ${subtype}` } });
  }
  if (msg.type === 'user') {
    const content = typeof msg.message.content === 'string' ? msg.message.content : msg.message.content.map((c) => c.text).join('');
    const abort = new AbortController();
    turn = { abort };
    runTurn(content, abort.signal)
      .catch((err) => {
        process.stderr.write(`fake-claude turn failed: ${err.stack ?? err}\n`);
        result('error_during_execution', { errors: [String(err)] });
      })
      .finally(() => {
        if (turn?.abort === abort) turn = undefined;
      });
  }
});
rl.on('close', () => {
  const finish = () => process.exit(0);
  if (!turn) finish();
  else setTimeout(finish, 50);
});
