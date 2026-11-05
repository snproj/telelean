import { describe, expect, it } from 'vitest';
import { LineSplitter, StreamNormalizer, UsageTracker, type StreamItem } from '../../src/llm/streamJson.js';
import type { LlmEvent } from '../../src/llm/types.js';

const SID = '0b7c6e0a-1f61-4a63-9d5e-3f1d2c4b5a69';

// Synthetic lines shaped like the documented SDKMessage types (Agent SDK TypeScript reference).
const INIT = {
  type: 'system',
  subtype: 'init',
  uuid: 'u1',
  session_id: SID,
  apiKeySource: 'none',
  claude_code_version: '2.1.314',
  cwd: '/ws',
  tools: ['Read', 'Glob', 'Grep', 'Edit', 'Write', 'mcp__telelean__ask_user', 'mcp__telelean__finish'],
  mcp_servers: [{ name: 'telelean', status: 'connected' }],
  model: 'claude-haiku-5-5',
  permissionMode: 'dontAsk',
  slash_commands: [],
  output_style: 'default',
  skills: [],
  plugins: [],
  capabilities: ['interrupt_receipt_v1'],
};
const usage = (input: number, output: number) => ({
  input_tokens: input,
  output_tokens: output,
  cache_creation_input_tokens: 100,
  cache_read_input_tokens: 2000,
});
const ASSISTANT_TEXT = {
  type: 'assistant',
  uuid: 'u2',
  session_id: SID,
  parent_tool_use_id: null,
  message: { id: 'msg_1', model: 'claude-haiku-5-5', role: 'assistant', content: [{ type: 'text', text: 'I will ask.' }], usage: usage(10, 5) },
};
const ASSISTANT_TOOL = {
  type: 'assistant',
  uuid: 'u3',
  session_id: SID,
  parent_tool_use_id: null,
  message: {
    id: 'msg_1',
    model: 'claude-haiku-5-5',
    role: 'assistant',
    content: [{ type: 'tool_use', id: 'toolu_1', name: 'mcp__telelean__ask_user', input: { questions: [] } }],
    usage: usage(10, 42),
  },
};
const TOOL_RESULT = {
  type: 'user',
  uuid: 'u4',
  session_id: SID,
  parent_tool_use_id: null,
  message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: [{ type: 'text', text: 'The user answered: yes' }] }] },
};
const DENIED_RESULT = {
  type: 'user',
  message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_2', is_error: true, content: 'telelean confinement: Read …' }] },
};
const RESULT = {
  type: 'result',
  subtype: 'success',
  uuid: 'u5',
  session_id: SID,
  duration_ms: 81234,
  duration_api_ms: 5120,
  is_error: false,
  num_turns: 3,
  result: 'Done.',
  stop_reason: 'end_turn',
  total_cost_usd: 0.0123,
  usage: usage(30, 80),
  modelUsage: { 'claude-haiku-5-5': { inputTokens: 30, outputTokens: 80, cacheReadInputTokens: 2000, cacheCreationInputTokens: 100, webSearchRequests: 0, costUSD: 0.0123, contextWindow: 200000, maxOutputTokens: 32000 } },
  permission_denials: [{ tool_name: 'Read', tool_use_id: 'toolu_2', tool_input: { file_path: '/etc/hostname' } }],
};

function events(items: StreamItem[]): LlmEvent[] {
  return items.flatMap((i) => (i.kind === 'event' ? [i.event] : []));
}

describe('LineSplitter', () => {
  it('joins chunks split mid-line and handles CRLF and blank lines', () => {
    const s = new LineSplitter();
    expect(s.push('{"a":1}\n{"b"')).toEqual(['{"a":1}']);
    expect(s.push(':2}\r\n\n  \n{"c":3}')).toEqual(['{"b":2}']);
    expect(s.flush()).toEqual(['{"c":3}']);
    expect(s.flush()).toEqual([]);
  });
});

describe('StreamNormalizer', () => {
  it('normalises a full turn: init, text, tool use, tool result, result', () => {
    const n = new StreamNormalizer();
    const out = [INIT, ASSISTANT_TEXT, ASSISTANT_TOOL, TOOL_RESULT, DENIED_RESULT, RESULT].flatMap((m) => events(n.line(JSON.stringify(m))));
    const types = out.map((e) => e.type);
    expect(types).toEqual(['init', 'assistant_text', 'usage', 'tool_use', 'usage', 'tool_result', 'tool_result', 'result']);

    const init = out[0];
    expect(init).toMatchObject({ type: 'init', sessionId: SID, model: 'claude-haiku-5-5', apiKeySource: 'none', version: '2.1.314', permissionMode: 'dontAsk' });
    expect(init?.type === 'init' && init.mcpServers).toEqual([{ name: 'telelean', status: 'connected' }]);
    expect(out[3]).toMatchObject({ type: 'tool_use', id: 'toolu_1', name: 'mcp__telelean__ask_user', messageId: 'msg_1' });
    expect(out[5]).toMatchObject({ type: 'tool_result', toolUseId: 'toolu_1', isError: false, text: 'The user answered: yes' });
    expect(out[6]).toMatchObject({ type: 'tool_result', toolUseId: 'toolu_2', isError: true });

    const result = out[7];
    expect(result).toMatchObject({
      type: 'result',
      status: 'success',
      sessionId: SID,
      numTurns: 3,
      durationMs: 81234,
      durationApiMs: 5120,
      costEstimateUsd: 0.0123,
      text: 'Done.',
      usage: { inputTokens: 30, outputTokens: 80, cacheCreationInputTokens: 100, cacheReadInputTokens: 2000 },
      permissionDenials: [{ toolName: 'Read', toolUseId: 'toolu_2' }],
    });
    expect(result?.type === 'result' && result.modelUsage['claude-haiku-5-5']?.costEstimateUsd).toBe(0.0123);
  });

  it('emits usage once per value per message id (the CLI repeats it on every content block)', () => {
    const n = new StreamNormalizer();
    const repeat = { ...ASSISTANT_TEXT, message: { ...ASSISTANT_TEXT.message, content: [{ type: 'text', text: 'more' }] } };
    const out = [ASSISTANT_TEXT, repeat, ASSISTANT_TOOL].flatMap((m) => events(n.line(JSON.stringify(m))));
    expect(out.filter((e) => e.type === 'usage')).toHaveLength(2); // same id: first value, then the grown one
    const tracker = new UsageTracker();
    out.forEach((e) => tracker.observe(e));
    expect(tracker.requestCount).toBe(1);
    expect(tracker.totals()).toEqual({ inputTokens: 10, outputTokens: 42, cacheCreationInputTokens: 100, cacheReadInputTokens: 2000 });
  });

  it('maps result subtypes to statuses', () => {
    const n = new StreamNormalizer();
    const status = (m: object) => {
      const [e] = events(n.line(JSON.stringify({ ...RESULT, ...m })));
      return e?.type === 'result' ? e.status : undefined;
    };
    expect(status({ subtype: 'error_max_turns', is_error: true })).toBe('max_turns');
    expect(status({ subtype: 'error_max_budget_usd', is_error: true })).toBe('max_budget');
    expect(status({ subtype: 'error_during_execution', is_error: true })).toBe('error');
    expect(status({ subtype: 'success', is_error: true })).toBe('error');
    expect(status({ subtype: 'error_during_execution', terminal_reason: 'aborted_by_interrupt' })).toBe('interrupted');
  });

  it('parses control responses, control requests and replays', () => {
    const n = new StreamNormalizer();
    expect(n.line(JSON.stringify({ type: 'control_response', response: { subtype: 'success', request_id: 'r1', response: { account: {} } } }))).toEqual([
      { kind: 'control_response', requestId: 'r1', ok: true, response: { account: {} } },
    ]);
    expect(n.line(JSON.stringify({ type: 'control_response', response: { subtype: 'error', request_id: 'r2', error: 'nope' } }))).toEqual([
      { kind: 'control_response', requestId: 'r2', ok: false, error: 'nope' },
    ]);
    expect(n.line(JSON.stringify({ type: 'control_request', request_id: 'c1', request: { subtype: 'can_use_tool', tool_name: 'Bash' } }))[0]).toMatchObject({
      kind: 'control_request',
      requestId: 'c1',
      subtype: 'can_use_tool',
    });
    expect(n.line(JSON.stringify({ type: 'user', isReplay: true, uuid: 'uu', message: { role: 'user', content: 'hi' } }))).toEqual([{ kind: 'user_replay', uuid: 'uu' }]);
  });

  it('normalises retries, permission denials, hook events, progress, partial text and rate limits', () => {
    const n = new StreamNormalizer();
    const one = (m: object) => events(n.line(JSON.stringify(m)))[0];
    expect(one({ type: 'system', subtype: 'api_retry', attempt: 2, max_retries: 10, retry_delay_ms: 4000, error_status: 529, error: 'overloaded' })).toEqual({
      type: 'retry',
      attempt: 2,
      maxRetries: 10,
      delayMs: 4000,
      error: 'overloaded',
      status: 529,
    });
    expect(one({ type: 'system', subtype: 'permission_denied', tool_name: 'Read', tool_use_id: 't', message: 'denied by hook' })).toMatchObject({
      type: 'permission_denied',
      toolName: 'Read',
      message: 'denied by hook',
    });
    expect(one({ type: 'system', subtype: 'hook_response', hook_event: 'PreToolUse', hook_name: 'PreToolUse:Read', exit_code: 0, outcome: 'success', stdout: '{"hookSpecificOutput":{}}' })).toMatchObject({
      type: 'hook',
      phase: 'response',
      hookEvent: 'PreToolUse',
      exitCode: 0,
    });
    expect(one({ type: 'tool_progress', tool_use_id: 't', tool_name: 'mcp__telelean__ask_user', elapsed_time_seconds: 30, heartbeat: true })).toEqual({
      type: 'tool_progress',
      toolUseId: 't',
      toolName: 'mcp__telelean__ask_user',
      elapsedSeconds: 30,
    });
    expect(one({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hel' } } })).toEqual({ type: 'text_delta', text: 'Hel' });
    expect(one({ type: 'rate_limit_event', rate_limit_info: { status: 'allowed' } })).toEqual({ type: 'rate_limit', info: { status: 'allowed' } });
    expect(one({ type: 'assistant', error: 'rate_limit', message: { id: 'm', content: [] } })).toMatchObject({ type: 'error', code: 'rate_limit', fatal: false });
  });

  it('keeps unknown messages as `other` and reports garbage without throwing', () => {
    const n = new StreamNormalizer();
    expect(events(n.line(JSON.stringify({ type: 'brand_new_thing', subtype: 'x', data: 1 })))[0]).toMatchObject({ type: 'other', rawType: 'brand_new_thing', subtype: 'x' });
    expect(events(n.line('not json {'))[0]).toMatchObject({ type: 'error', fatal: false, code: 'protocol' });
    expect(events(n.line('[1,2]'))[0]).toMatchObject({ type: 'error', code: 'protocol' });
    expect(n.line(JSON.stringify({ type: 'keep_alive' }))).toEqual([{ kind: 'keep_alive' }]);
  });
});
