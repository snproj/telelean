// FakeBackend: replays scripted steps against the shadow workspace (03 §8.1).
//
// Steps run the real pieces: file writes go through the same path guard as the CLI's hook and
// land in the shadow; tool calls are validated with the real schemas and dispatched to the real
// AgentToolHost (so ask_user blocks, finish runs the gate). Tests and the walkthrough use it to
// exercise everything except the model.
//
// M2 (WP3) additions: `usage` and `rateLimit` steps emit the events the CLI reports per API
// response and per rate-limit update (so the host's turn cap and usage display are testable), a
// `sleep` step lets agent-active time pass (fake timers advance it; an interrupt ends it early),
// and a `result` step may carry the CLI's cumulative cost estimate (`costEstimateUsd`), which
// later implicit results of the same session repeat, as the CLI's cumulative figure would.

import { randomUUID } from 'node:crypto';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { decide } from '../../bin/telelean-path-guard.mjs';
import { buildGuardPolicy } from './confinement.js';
import {
  mcpToolName,
  renderAdoption,
  renderAnswers,
  renderCheckResult,
  renderFreezeResult,
  renderGateVerdict,
  toolInputSchemas,
} from './toolSchemas.js';
import {
  LlmHarnessError,
  type AgentToolName,
  type AskUserArgs,
  type BackendCaps,
  type CheckLeanArgs,
  type FinishArgs,
  type FreezeStatementsArgs,
  type ProposeAssumptionArgs,
  type LlmBackend,
  type LlmEvent,
  type LlmSession,
  type ResultStatus,
  type SessionConfig,
  type TokenUsage,
  type ToolCallContext,
} from './types.js';

export type FakeStep =
  | { kind: 'text'; text: string }
  | { kind: 'writeFile'; path: string; content: string }
  | { kind: 'edit'; path: string; oldString: string; newString: string }
  | { kind: 'read'; path: string }
  | { kind: 'callTool'; tool: AgentToolName; args: unknown }
  /** M2: one API response's usage (the host counts turns per distinct message id). Default id: a fresh one. */
  | { kind: 'usage'; messageId?: string; model?: string; usage?: Partial<TokenUsage> }
  /** M2: a rate-limit update, e.g. `{ status: 'allowed_warning', resetsAt: 1793503200 }` (the CLI's rate_limit_info). */
  | { kind: 'rateLimit'; info: Record<string, unknown> }
  /** M2: the model "thinks" for `ms` (setTimeout, so fake timers control it); an interrupt or close ends it early. */
  | { kind: 'sleep'; ms: number }
  /** Ends the turn. `costEstimateUsd`: the CLI's cumulative estimate for the session (repeated by later implicit results). */
  | { kind: 'result'; status?: ResultStatus; text?: string; costEstimateUsd?: number; usage?: Partial<TokenUsage> };

/** Steps for one user turn, chosen from the turn text and its 0-based index in the session. */
export type FakeScript = FakeStep[][] | ((turn: string, index: number) => FakeStep[]);

const ZERO_USAGE: TokenUsage = { inputTokens: 0, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 };

export class FakeBackend implements LlmBackend {
  readonly id = 'fake' as const;
  readonly caps: BackendCaps = { builtinFileTools: true, subscriptionAuth: false, resume: true, interrupt: true };
  private readonly script: FakeScript;

  constructor(script: FakeScript) {
    this.script = script;
  }

  async startSession(cfg: SessionConfig): Promise<FakeSession> {
    return new FakeSession(cfg, this.script, await realpath(cfg.cwd));
  }
}

/** One send(): whether its events are being read, whether it has ended, and why. */
interface FakeTurn {
  started: boolean;
  done: boolean;
  interrupted: boolean;
  /** Set when the turn was interrupted before anyone read it: its only event. */
  cancelled?: LlmEvent;
}

export class FakeSession implements LlmSession {
  private readonly cfg: SessionConfig;
  private readonly script: FakeScript;
  private readonly rootReal: string;
  private readonly listeners = new Set<(e: LlmEvent) => void>();
  private readonly id: string;
  private turnIndex = 0;
  private current: FakeTurn | undefined;
  private closed = false;
  private abort = new AbortController();
  private seq = 0;
  /** The latest explicit cost estimate of this session (implicit results repeat it: the CLI's figure is cumulative). */
  private lastCost = 0;

  constructor(cfg: SessionConfig, script: FakeScript, rootReal: string) {
    this.cfg = cfg;
    this.script = script;
    this.rootReal = rootReal;
    this.id = cfg.resumeSessionId ?? cfg.sessionId ?? randomUUID();
  }

  get sessionId(): string {
    return this.id;
  }

  onEvent(listener: (e: LlmEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  send(turn: string): AsyncIterable<LlmEvent> {
    if (this.closed) throw new LlmHarnessError('closed', 'the session is closed');
    if (this.current && !this.current.done) throw new LlmHarnessError('busy', 'a turn is already running');
    const t: FakeTurn = { started: false, done: false, interrupted: false };
    this.current = t;
    const index = this.turnIndex++;
    const steps = typeof this.script === 'function' ? this.script(turn, index) : (this.script[index] ?? []);
    return this.run(steps, index, t);
  }

  /**
   * Ends the current turn. A turn whose events nobody has started reading ends at once with an
   * `interrupted` result (as the CLI backend's turn ends on the CLI's own result, read or not),
   * so the next send() is accepted.
   */
  async interrupt(): Promise<void> {
    const t = this.current;
    if (t && !t.done) {
      t.interrupted = true;
      if (!t.started) this.cancelUnstarted(t);
    }
    this.abort.abort();
    this.abort = new AbortController();
  }

  async close(): Promise<void> {
    this.closed = true;
    const t = this.current;
    if (t && !t.done) {
      t.interrupted = true;
      if (!t.started) this.cancelUnstarted(t);
    }
    this.abort.abort();
  }

  private cancelUnstarted(t: FakeTurn): void {
    t.done = true;
    t.cancelled = this.emit(this.result('interrupted', 0, Date.now()));
  }

  private emit(e: LlmEvent): LlmEvent {
    for (const l of this.listeners) l(e);
    return e;
  }

  private async *run(steps: FakeStep[], index: number, t: FakeTurn): AsyncGenerator<LlmEvent> {
    if (t.cancelled) {
      // Interrupted before anyone read it: the result was already reported to listeners.
      yield t.cancelled;
      return;
    }
    t.started = true;
    const started = Date.now();
    let numTurns = 1;
    try {
      if (index === 0) {
        yield this.emit({
          type: 'init',
          sessionId: this.id,
          model: this.cfg.model,
          cwd: this.rootReal,
          tools: ['Read', 'Glob', 'Grep', 'Edit', 'Write', ...['check_lean', 'freeze_statements', 'ask_user', 'propose_assumption', 'finish'].map((t) => mcpToolName(t as AgentToolName))],
          mcpServers: [{ name: 'telelean', status: 'connected' }],
          apiKeySource: 'none',
        });
      }
      for (const step of steps) {
        if (t.interrupted || this.closed) {
          yield this.emit(this.result('interrupted', numTurns, started));
          return;
        }
        if (step.kind === 'result') {
          if (step.costEstimateUsd !== undefined) this.lastCost = step.costEstimateUsd;
          yield this.emit(this.result(step.status ?? 'success', numTurns, started, step.text, step.usage));
          return;
        }
        if (step.kind === 'text') {
          yield this.emit({ type: 'assistant_text', text: step.text, parentToolUseId: null });
          continue;
        }
        if (step.kind === 'usage') {
          this.seq += 1;
          const e: LlmEvent = {
            type: 'usage',
            messageId: step.messageId ?? `fake_msg_${this.seq}`,
            usage: { ...ZERO_USAGE, ...(step.usage ?? {}) },
            parentToolUseId: null,
          };
          if (step.model !== undefined) e.model = step.model;
          yield this.emit(e);
          continue;
        }
        if (step.kind === 'rateLimit') {
          yield this.emit({ type: 'rate_limit', info: { ...step.info } });
          continue;
        }
        if (step.kind === 'sleep') {
          await this.sleep(step.ms);
          continue;
        }
        numTurns += 1;
        for await (const e of this.toolStep(step)) yield this.emit(e);
      }
      yield this.emit(this.result(t.interrupted ? 'interrupted' : 'success', numTurns, started));
    } finally {
      t.done = true;
    }
  }

  private result(status: ResultStatus, numTurns: number, started: number, text?: string, usage?: Partial<TokenUsage>): LlmEvent {
    const e: LlmEvent = {
      type: 'result',
      status,
      isError: status !== 'success',
      sessionId: this.id,
      numTurns,
      durationMs: Date.now() - started,
      usage: { ...ZERO_USAGE, ...(usage ?? {}) },
      costEstimateUsd: this.lastCost,
      modelUsage: {},
      permissionDenials: [],
      errors: [],
    };
    if (text !== undefined) e.text = text;
    return e;
  }

  /** Waits `ms` (a timer, so fake timers control it), or until the turn is interrupted or the session closed. */
  private sleep(ms: number): Promise<void> {
    const signal = this.abort.signal;
    if (signal.aborted || this.closed) return Promise.resolve();
    return new Promise((resolve) => {
      const done = (): void => {
        clearTimeout(timer);
        signal.removeEventListener('abort', done);
        resolve();
      };
      const timer = setTimeout(done, Math.max(0, ms));
      signal.addEventListener('abort', done, { once: true });
    });
  }

  private async *toolStep(
    step: Extract<FakeStep, { kind: 'writeFile' } | { kind: 'edit' } | { kind: 'read' } | { kind: 'callTool' }>,
  ): AsyncGenerator<LlmEvent> {
    this.seq += 1;
    const id = `fake_toolu_${this.seq}`;
    if (step.kind === 'callTool') {
      yield { type: 'tool_use', id, name: mcpToolName(step.tool), input: step.args };
      const r = await this.callTool(step.tool, step.args);
      yield { type: 'tool_result', toolUseId: id, isError: r.isError, text: r.text };
      return;
    }
    const toolName = step.kind === 'writeFile' ? 'Write' : step.kind === 'edit' ? 'Edit' : 'Read';
    const filePath = path.isAbsolute(step.path) ? step.path : path.join(this.rootReal, step.path);
    yield { type: 'tool_use', id, name: toolName, input: { file_path: filePath } };
    const policy = buildGuardPolicy(this.rootReal, '');
    delete policy.logFile;
    const decision = decide({ hook_event_name: 'PreToolUse', tool_name: toolName, tool_input: { file_path: filePath }, cwd: this.rootReal }, policy);
    if (decision.kind === 'deny') {
      yield { type: 'permission_denied', toolName, toolUseId: id, message: decision.reason };
      yield { type: 'tool_result', toolUseId: id, isError: true, text: decision.reason };
      return;
    }
    try {
      if (step.kind === 'writeFile') {
        await mkdir(path.dirname(filePath), { recursive: true });
        await writeFile(filePath, step.content);
        yield { type: 'tool_result', toolUseId: id, isError: false, text: `wrote ${filePath}` };
      } else if (step.kind === 'edit') {
        const before = await readFile(filePath, 'utf8');
        if (!before.includes(step.oldString)) throw new Error('old_string not found');
        await writeFile(filePath, before.replace(step.oldString, step.newString));
        yield { type: 'tool_result', toolUseId: id, isError: false, text: `edited ${filePath}` };
      } else {
        yield { type: 'tool_result', toolUseId: id, isError: false, text: await readFile(filePath, 'utf8') };
      }
    } catch (err) {
      yield { type: 'tool_result', toolUseId: id, isError: true, text: (err as Error).message };
    }
  }

  private async callTool(tool: AgentToolName, rawArgs: unknown): Promise<{ isError: boolean; text: string }> {
    const parsed = toolInputSchemas[tool].safeParse(rawArgs);
    if (!parsed.success) return { isError: true, text: `invalid ${tool} arguments: ${parsed.error.message}` };
    const ctx: ToolCallContext = { signal: this.abort.signal };
    const host = this.cfg.toolHost;
    const data: unknown = parsed.data;
    try {
      switch (tool) {
        case 'ask_user': {
          const args = data as AskUserArgs;
          return { isError: false, text: renderAnswers(args, await host.ask_user(args, ctx)) };
        }
        case 'check_lean':
          return { isError: false, text: renderCheckResult(await host.check_lean(data as CheckLeanArgs, ctx)) };
        case 'freeze_statements':
          return { isError: false, text: renderFreezeResult(await host.freeze_statements(data as FreezeStatementsArgs, ctx)) };
        case 'propose_assumption':
          return { isError: false, text: renderAdoption(await host.propose_assumption(data as ProposeAssumptionArgs, ctx)) };
        case 'finish':
          return { isError: false, text: renderGateVerdict(await host.finish(data as FinishArgs, ctx)) };
      }
    } catch (err) {
      return { isError: true, text: `telelean ${tool} failed: ${(err as Error).message}` };
    }
  }
}
