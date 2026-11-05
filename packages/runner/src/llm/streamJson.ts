// Parsing the Claude Code CLI's stream-json output (`-p --output-format stream-json --verbose`)
// into normalized LlmEvents, plus the control-protocol frames the session handles itself.
//
// Message shapes follow the Agent SDK's SDKMessage types (code.claude.com/docs/en/agent-sdk/typescript)
// and the CLI 2.1.314 control protocol: {"type":"control_request","request_id","request":{subtype,…}}
// answered by {"type":"control_response","response":{"subtype":"success"|"error","request_id",…}}.
// Unknown message types become `other` events instead of errors (forward compatibility).

import type {
  InitEvent,
  LlmEvent,
  ModelUsageSummary,
  ResultEvent,
  ResultStatus,
  TokenUsage,
} from './types.js';

export type StreamItem =
  | { kind: 'event'; event: LlmEvent }
  | { kind: 'control_response'; requestId: string; ok: true; response: unknown }
  | { kind: 'control_response'; requestId: string; ok: false; error: string }
  | { kind: 'control_request'; requestId: string; subtype: string; request: Record<string, unknown> }
  | { kind: 'control_cancel_request'; requestId: string }
  | { kind: 'user_replay'; uuid?: string }
  | { kind: 'keep_alive' };

/** Splits a byte stream into lines; tolerates \r\n and chunks that end mid-line. */
export class LineSplitter {
  private buffer = '';

  push(chunk: string): string[] {
    this.buffer += chunk;
    const parts = this.buffer.split('\n');
    this.buffer = parts.pop() ?? '';
    return parts.map((l) => l.replace(/\r$/, '')).filter((l) => l.trim() !== '');
  }

  flush(): string[] {
    const rest = this.buffer.trim();
    this.buffer = '';
    return rest === '' ? [] : [rest];
  }
}

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const num = (v: unknown, dflt = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : dflt);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const ev = (event: LlmEvent): StreamItem => ({ kind: 'event', event });

const MAX_TEXT = 20_000;
const truncate = (s: string, n = MAX_TEXT): string => (s.length > n ? `${s.slice(0, n)}… [${s.length - n} more chars]` : s);

export function tokenUsage(u: unknown): TokenUsage {
  const r = isRec(u) ? u : {};
  return {
    inputTokens: num(r.input_tokens),
    outputTokens: num(r.output_tokens),
    cacheCreationInputTokens: num(r.cache_creation_input_tokens),
    cacheReadInputTokens: num(r.cache_read_input_tokens),
  };
}

function modelUsage(v: unknown): Record<string, ModelUsageSummary> {
  const out: Record<string, ModelUsageSummary> = {};
  if (!isRec(v)) return out;
  for (const [model, u] of Object.entries(v)) {
    if (!isRec(u)) continue;
    out[model] = {
      inputTokens: num(u.inputTokens),
      outputTokens: num(u.outputTokens),
      cacheReadInputTokens: num(u.cacheReadInputTokens),
      cacheCreationInputTokens: num(u.cacheCreationInputTokens),
      costEstimateUsd: num(u.costUSD),
    };
  }
  return out;
}

export function toolResultText(content: unknown): string {
  if (typeof content === 'string') return truncate(content);
  const parts: string[] = [];
  for (const block of arr(content)) {
    if (isRec(block) && block.type === 'text' && typeof block.text === 'string') parts.push(block.text);
    else if (isRec(block) && typeof block.type === 'string') parts.push(`[${block.type}]`);
  }
  return truncate(parts.join('\n'));
}

function initEvent(m: Rec): InitEvent {
  const servers = arr(m.mcp_servers)
    .filter(isRec)
    .map((s) => ({ name: str(s.name) ?? '?', status: str(s.status) ?? '?' }));
  const event: InitEvent = {
    type: 'init',
    sessionId: str(m.session_id) ?? '',
    model: str(m.model) ?? '',
    tools: arr(m.tools).filter((t): t is string => typeof t === 'string'),
    mcpServers: servers,
  };
  const cwd = str(m.cwd);
  if (cwd !== undefined) event.cwd = cwd;
  const permissionMode = str(m.permissionMode);
  if (permissionMode !== undefined) event.permissionMode = permissionMode;
  const apiKeySource = str(m.apiKeySource);
  if (apiKeySource !== undefined) event.apiKeySource = apiKeySource;
  const version = str(m.claude_code_version);
  if (version !== undefined) event.version = version;
  if (Array.isArray(m.capabilities)) event.capabilities = m.capabilities.filter((c): c is string => typeof c === 'string');
  if (Array.isArray(m.mcp_server_errors)) event.mcpServerErrors = m.mcp_server_errors;
  return event;
}

export function resultStatus(subtype: string | undefined, isError: boolean, terminalReason?: string): ResultStatus {
  if (terminalReason !== undefined && /interrupt|abort|cancel/i.test(terminalReason)) return 'interrupted';
  switch (subtype) {
    case 'success':
      return isError ? 'error' : 'success';
    case 'error_max_turns':
      return 'max_turns';
    case 'error_max_budget_usd':
      return 'max_budget';
    default:
      return 'error';
  }
}

function resultEvent(m: Rec): ResultEvent {
  const isError = m.is_error === true;
  const terminalReason = str(m.terminal_reason);
  const event: ResultEvent = {
    type: 'result',
    status: resultStatus(str(m.subtype), isError, terminalReason),
    isError,
    sessionId: str(m.session_id) ?? '',
    numTurns: num(m.num_turns),
    durationMs: num(m.duration_ms),
    usage: tokenUsage(m.usage),
    costEstimateUsd: num(m.total_cost_usd),
    modelUsage: modelUsage(m.modelUsage),
    permissionDenials: arr(m.permission_denials)
      .filter(isRec)
      .map((d) => ({ toolName: str(d.tool_name) ?? '?', toolUseId: str(d.tool_use_id) ?? '' })),
    errors: arr(m.errors).map((e) => (typeof e === 'string' ? e : JSON.stringify(e))),
  };
  if (typeof m.duration_api_ms === 'number') event.durationApiMs = m.duration_api_ms;
  const text = str(m.result);
  if (text !== undefined) event.text = truncate(text);
  if (m.stop_reason === null || typeof m.stop_reason === 'string') event.stopReason = m.stop_reason;
  if (terminalReason !== undefined) event.terminalReason = terminalReason;
  return event;
}

function hookEvent(m: Rec, phase: 'started' | 'progress' | 'response'): LlmEvent {
  const e: Extract<LlmEvent, { type: 'hook' }> = { type: 'hook', phase };
  const hookEventName = str(m.hook_event) ?? str(m.hook_event_name);
  if (hookEventName !== undefined) e.hookEvent = hookEventName;
  const hookName = str(m.hook_name);
  if (hookName !== undefined) e.hookName = hookName;
  const outcome = str(m.outcome);
  if (outcome !== undefined) e.outcome = outcome;
  if (typeof m.exit_code === 'number') e.exitCode = m.exit_code;
  const output = str(m.output) ?? str(m.stdout);
  if (output !== undefined && output !== '') e.output = truncate(output, 4000);
  return e;
}

/** Stateful: deduplicates per-response usage (the CLI repeats it on every content block). */
export class StreamNormalizer {
  private readonly usageSeen = new Map<string, string>();

  line(line: string): StreamItem[] {
    let msg: unknown;
    try {
      msg = JSON.parse(line);
    } catch {
      return [ev({ type: 'error', message: `unparsable line from the CLI: ${truncate(line, 300)}`, fatal: false, code: 'protocol' })];
    }
    if (!isRec(msg)) {
      return [ev({ type: 'error', message: `non-object line from the CLI: ${truncate(line, 300)}`, fatal: false, code: 'protocol' })];
    }
    return this.message(msg);
  }

  message(m: Rec): StreamItem[] {
    const type = str(m.type) ?? '';
    switch (type) {
      case 'system':
        return this.system(m);
      case 'assistant':
        return this.assistant(m);
      case 'user':
        return this.user(m);
      case 'stream_event':
        return this.streamEvent(m);
      case 'result':
        return [ev(resultEvent(m))];
      case 'rate_limit_event':
        return [ev({ type: 'rate_limit', info: isRec(m.rate_limit_info) ? m.rate_limit_info : m })];
      case 'tool_progress':
        return [
          ev({
            type: 'tool_progress',
            toolUseId: str(m.tool_use_id) ?? '',
            toolName: str(m.tool_name) ?? '',
            elapsedSeconds: num(m.elapsed_time_seconds),
          }),
        ];
      case 'control_response':
        return this.controlResponse(m);
      case 'control_request': {
        const request = isRec(m.request) ? m.request : {};
        return [{ kind: 'control_request', requestId: str(m.request_id) ?? '', subtype: str(request.subtype) ?? '', request }];
      }
      case 'control_cancel_request':
        return [{ kind: 'control_cancel_request', requestId: str(m.request_id) ?? '' }];
      case 'keep_alive':
        return [{ kind: 'keep_alive' }];
      default: {
        const other: LlmEvent = { type: 'other', rawType: type, raw: m };
        const subtype = str(m.subtype);
        if (subtype !== undefined) other.subtype = subtype;
        return [ev(other)];
      }
    }
  }

  private system(m: Rec): StreamItem[] {
    const subtype = str(m.subtype);
    switch (subtype) {
      case 'init':
        return [ev(initEvent(m))];
      case 'api_retry':
        return [
          ev({
            type: 'retry',
            attempt: num(m.attempt),
            maxRetries: num(m.max_retries),
            delayMs: num(m.retry_delay_ms),
            error: str(m.error) ?? 'unknown',
            status: typeof m.error_status === 'number' ? m.error_status : null,
          }),
        ];
      case 'permission_denied': {
        const e: Extract<LlmEvent, { type: 'permission_denied' }> = { type: 'permission_denied' };
        const toolName = str(m.tool_name);
        if (toolName !== undefined) e.toolName = toolName;
        const toolUseId = str(m.tool_use_id);
        if (toolUseId !== undefined) e.toolUseId = toolUseId;
        const message = str(m.message) ?? str(m.reason);
        if (message !== undefined) e.message = message;
        return [ev(e)];
      }
      case 'hook_started':
        return [ev(hookEvent(m, 'started'))];
      case 'hook_progress':
        return [ev(hookEvent(m, 'progress'))];
      case 'hook_response':
        return [ev(hookEvent(m, 'response'))];
      default: {
        const other: LlmEvent = { type: 'other', rawType: 'system', raw: m };
        if (subtype !== undefined) other.subtype = subtype;
        return [ev(other)];
      }
    }
  }

  private assistant(m: Rec): StreamItem[] {
    const message = isRec(m.message) ? m.message : {};
    const id = str(message.id);
    const parent = typeof m.parent_tool_use_id === 'string' ? m.parent_tool_use_id : null;
    const items: StreamItem[] = [];
    if (m.error !== undefined && m.error !== null) {
      const code = typeof m.error === 'string' ? m.error : JSON.stringify(m.error);
      items.push(ev({ type: 'error', message: `the model request failed: ${code}`, fatal: false, code }));
    }
    for (const block of arr(message.content)) {
      if (!isRec(block)) continue;
      if (block.type === 'text' && typeof block.text === 'string') {
        const e: LlmEvent = { type: 'assistant_text', text: block.text, parentToolUseId: parent };
        if (id !== undefined) e.messageId = id;
        items.push(ev(e));
      } else if (block.type === 'thinking' || block.type === 'redacted_thinking') {
        const e: LlmEvent = { type: 'thinking', text: str(block.thinking) ?? '' };
        if (id !== undefined) e.messageId = id;
        items.push(ev(e));
      } else if (block.type === 'tool_use' || block.type === 'server_tool_use' || block.type === 'mcp_tool_use') {
        const e: LlmEvent = { type: 'tool_use', id: str(block.id) ?? '', name: str(block.name) ?? '', input: block.input };
        if (id !== undefined) e.messageId = id;
        items.push(ev(e));
      }
    }
    if (id !== undefined && isRec(message.usage)) {
      const usage = tokenUsage(message.usage);
      const key = JSON.stringify(usage);
      if (this.usageSeen.get(id) !== key) {
        this.usageSeen.set(id, key);
        const e: LlmEvent = { type: 'usage', messageId: id, usage, parentToolUseId: parent };
        const model = str(message.model);
        if (model !== undefined) e.model = model;
        items.push(ev(e));
      }
    }
    return items;
  }

  private user(m: Rec): StreamItem[] {
    if (m.isReplay === true) {
      const uuid = str(m.uuid);
      return [uuid === undefined ? { kind: 'user_replay' } : { kind: 'user_replay', uuid }];
    }
    const message = isRec(m.message) ? m.message : {};
    const items: StreamItem[] = [];
    for (const block of arr(message.content)) {
      if (isRec(block) && block.type === 'tool_result') {
        items.push(
          ev({
            type: 'tool_result',
            toolUseId: str(block.tool_use_id) ?? '',
            isError: block.is_error === true,
            text: toolResultText(block.content),
          }),
        );
      }
    }
    return items;
  }

  private streamEvent(m: Rec): StreamItem[] {
    const e = isRec(m.event) ? m.event : {};
    const delta = isRec(e.delta) ? e.delta : {};
    if (e.type === 'content_block_delta' && delta.type === 'text_delta' && typeof delta.text === 'string') {
      return [ev({ type: 'text_delta', text: delta.text })];
    }
    return [];
  }

  private controlResponse(m: Rec): StreamItem[] {
    const r = isRec(m.response) ? m.response : {};
    const requestId = str(r.request_id) ?? '';
    if (r.subtype === 'success') return [{ kind: 'control_response', requestId, ok: true, response: r.response }];
    return [{ kind: 'control_response', requestId, ok: false, error: str(r.error) ?? 'unknown control error' }];
  }
}

/** Counts API responses and tokens from `usage` events (latest value per message id). */
export class UsageTracker {
  private readonly perMessage = new Map<string, { model?: string; usage: TokenUsage; subagent: boolean }>();

  observe(e: LlmEvent): void {
    if (e.type !== 'usage') return;
    const entry: { model?: string; usage: TokenUsage; subagent: boolean } = {
      usage: e.usage,
      subagent: e.parentToolUseId != null,
    };
    if (e.model !== undefined) entry.model = e.model;
    this.perMessage.set(e.messageId, entry);
  }

  get requestCount(): number {
    return this.perMessage.size;
  }

  totals(): TokenUsage {
    const t: TokenUsage = { inputTokens: 0, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 };
    for (const { usage } of this.perMessage.values()) {
      t.inputTokens += usage.inputTokens;
      t.outputTokens += usage.outputTokens;
      t.cacheCreationInputTokens += usage.cacheCreationInputTokens;
      t.cacheReadInputTokens += usage.cacheReadInputTokens;
    }
    return t;
  }
}
