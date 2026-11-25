// ClaudeCliBackend: drives the user's own Claude Code CLI in headless stream-json mode
// (amendment 1, the "learnharness pattern"; 03 §8.2 with the CLI instead of the Agent SDK).
//
//   claude -p --input-format stream-json --output-format stream-json --verbose …
//
// Startup, before any prompt is sent (so a refusal costs no quota):
//   0. Before the CLI starts: the path guard is run exactly as the generated settings specify, on
//      a synthetic outside read (must be denied) and inside read (must pass). With
//      `onFailure: "block"` a hook that cannot start would otherwise block every tool call.
//   1. `initialize` control request: the reply carries the account (provider, subscription,
//      API-key source). Anything but a claude.ai subscription login is refused.
//   2. `get_hooks_listing` control request: the path guard must be listed and enabled, because a
//      settings file that fails validation is silently ignored in -p mode.
// The CLI runs in its own process group; close() ends the whole group.

import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  selfTestGuard,
  verifyHooksListing,
  writeConfinementFiles,
  type ConfinementFiles,
  type GuardSelfTest,
  type HookRuntime,
  type HookVerification,
} from './confinement.js';
import { gitCeilingEnv, sanitizeClaudeEnv } from './env.js';
import { LineSplitter, StreamNormalizer, type StreamItem } from './streamJson.js';
import { startToolServer, type ToolServer, type ToolServerOptions } from './toolServer.js';
import { MCP_TOOL_PREFIX } from './toolSchemas.js';
import {
  LlmHarnessError,
  type AuthInfo,
  type AuthVerdict,
  type BackendCaps,
  type Effort,
  type LlmBackend,
  type LlmEvent,
  type LlmSession,
  type SessionConfig,
  type ThinkingMode,
} from './types.js';

/**
 * Quota tripwire (docs/m2-plan.md section 10.4): every test runner and the walkthrough script's dry run set this
 * variable to `1`. Under it `run.createClaudeBackend` refuses to resolve a real binary (unless a test passes fake
 * binaries) and `ClaudeCliBackend.startSession` refuses to spawn anything but M0's node test double.
 */
export const NO_REAL_CLAUDE_ENV = 'TELELEAN_NO_REAL_CLAUDE';

/**
 * True when the quota tripwire is armed: any non-empty value other than `0` or `false` (fixer round 1: `true`, `yes`
 * or `on` arm it too, so a slightly different spelling never silently leaves real Claude reachable).
 */
export function realClaudeDisabled(env: Record<string, string | undefined> = process.env): boolean {
  const value = env[NO_REAL_CLAUDE_ENV]?.trim().toLowerCase();
  return value !== undefined && value !== '' && value !== '0' && value !== 'false';
}

/**
 * Under the tripwire, the only process `startSession` may start: M0's node test double (a `.mjs`/`.js` script that
 * lives in a `test` folder's `fixtures`, e.g. packages/runner/test/llm/fixtures/fake-claude.mjs), launched with this
 * very Node binary (fixer round 1: a launcher of `process.execPath` alone would also run a JavaScript Claude Code CLI).
 */
export function isTestDoubleLaunch(launcherCommand: string | undefined, binaryPath: string): boolean {
  if (launcherCommand !== process.execPath) return false;
  const parts = binaryPath.split(/[\\/]+/);
  const fixtures = parts.lastIndexOf('fixtures');
  return /\.(mjs|js)$/.test(binaryPath) && fixtures > 0 && parts.slice(0, fixtures).includes('test');
}

/** Built-in tools the agent gets. No shell, no web, no subagents (D-24). */
export const BUILTIN_TOOLS = ['Read', 'Glob', 'Grep', 'Edit', 'Write'] as const;
/** Denied explicitly as well, in case a future CLI adds them to the base set. */
export const DISALLOWED_TOOLS = ['Bash', 'WebFetch', 'WebSearch', 'Agent', 'AskUserQuestion', 'NotebookEdit'] as const;

export interface ClaudeArgsInput {
  model: string;
  effort?: Effort | undefined;
  thinking?: ThinkingMode | undefined;
  maxTurns?: number | undefined;
  maxBudgetUsd?: number | undefined;
  systemPromptFile: string;
  settingsFile: string;
  mcpConfigFile: string;
  /** Fixed id for a new session. Ignored when resuming. */
  sessionId?: string | undefined;
  resumeSessionId?: string | undefined;
  restricted: boolean;
  includePartialMessages: boolean;
  includeHookEvents: boolean;
  permissionPromptsNone: boolean;
}

/** The CLI flags (verified against `claude --help` of 2.1.314; never `--bare`). */
export function buildClaudeArgs(i: ClaudeArgsInput): string[] {
  const args = ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose'];
  if (i.includePartialMessages) args.push('--include-partial-messages');
  if (i.includeHookEvents) args.push('--include-hook-events');
  args.push('--model', i.model);
  if (i.effort !== undefined) args.push('--effort', i.effort);
  if (i.thinking !== undefined) args.push('--thinking', i.thinking);
  args.push('--system-prompt-file', i.systemPromptFile);
  args.push('--tools', BUILTIN_TOOLS.join(','));
  args.push('--allowedTools', [...BUILTIN_TOOLS, `${MCP_TOOL_PREFIX}*`].join(','));
  args.push('--disallowedTools', DISALLOWED_TOOLS.join(','));
  args.push('--permission-mode', 'dontAsk');
  if (i.permissionPromptsNone) args.push('--permission-prompts', 'none');
  if (i.restricted) args.push('--restricted');
  // No user, project or local settings: the CLI parses an empty list as "none".
  args.push('--setting-sources=');
  args.push('--settings', i.settingsFile);
  args.push('--strict-mcp-config', '--mcp-config', i.mcpConfigFile);
  if (i.maxTurns !== undefined) args.push('--max-turns', String(i.maxTurns));
  if (i.maxBudgetUsd !== undefined) args.push('--max-budget-usd', String(i.maxBudgetUsd));
  if (i.resumeSessionId !== undefined) args.push('--resume', i.resumeSessionId);
  else if (i.sessionId !== undefined) args.push('--session-id', i.sessionId);
  return args;
}

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined);

/**
 * Classifies the account from the initialize reply. In 2.1.314 a claude.ai subscription login
 * reports apiProvider "firstParty" and a subscriptionType, with no apiKeySource and no tokenSource.
 */
export function classifyAuth(account: unknown, initApiKeySource?: string): AuthInfo {
  const a = isRec(account) ? account : {};
  const apiProvider = str(a.apiProvider);
  const subscriptionType = str(a.subscriptionType);
  const tokenSource = str(a.tokenSource);
  const apiKeySource = str(a.apiKeySource) ?? initApiKeySource;
  let verdict: AuthVerdict;
  if (apiProvider !== undefined && apiProvider !== 'firstParty') verdict = 'third-party';
  else if (apiKeySource !== undefined && apiKeySource !== 'none') verdict = 'api-key';
  else if (tokenSource !== undefined && tokenSource !== 'claude.ai') {
    verdict = tokenSource.includes('OAUTH_TOKEN') ? 'oauth-token' : 'unknown';
  } else if (apiProvider === 'firstParty' && subscriptionType !== undefined) verdict = 'subscription';
  else verdict = 'unknown';
  const info: AuthInfo = { verdict, hasEmail: typeof a.email === 'string' && a.email !== '' };
  if (apiProvider !== undefined) info.apiProvider = apiProvider;
  if (subscriptionType !== undefined) info.subscriptionType = subscriptionType;
  if (tokenSource !== undefined) info.tokenSource = tokenSource;
  if (apiKeySource !== undefined) info.apiKeySource = apiKeySource;
  return info;
}

export function describeAuth(a: AuthInfo): string {
  const parts = [`verdict=${a.verdict}`];
  if (a.apiProvider) parts.push(`apiProvider=${a.apiProvider}`);
  if (a.subscriptionType) parts.push(`subscription=${a.subscriptionType}`);
  if (a.tokenSource) parts.push(`tokenSource=${a.tokenSource}`);
  if (a.apiKeySource) parts.push(`apiKeySource=${a.apiKeySource}`);
  return parts.join(', ');
}

/** Single-consumer async queue used for one turn's events. */
class AsyncQueue<T> implements AsyncIterable<T> {
  private readonly items: T[] = [];
  private readonly waiters: Array<(r: IteratorResult<T>) => void> = [];
  private ended = false;

  push(item: T): void {
    if (this.ended) return;
    const waiter = this.waiters.shift();
    if (waiter) waiter({ value: item, done: false });
    else this.items.push(item);
  }

  end(): void {
    if (this.ended) return;
    this.ended = true;
    for (const w of this.waiters.splice(0)) w({ value: undefined, done: true });
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => {
        if (this.items.length > 0) return Promise.resolve({ value: this.items.shift() as T, done: false });
        if (this.ended) return Promise.resolve({ value: undefined, done: true });
        return new Promise((resolve) => this.waiters.push(resolve));
      },
      return: () => Promise.resolve({ value: undefined, done: true }),
    };
  }
}

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms).unref());

// Kill every live CLI process group if the host process exits normally.
const liveSessions = new Set<ClaudeCliSession>();
let exitHookInstalled = false;
function trackSession(s: ClaudeCliSession): void {
  liveSessions.add(s);
  if (!exitHookInstalled) {
    exitHookInstalled = true;
    process.once('exit', () => {
      for (const live of liveSessions) live.killProcessTree('SIGTERM');
    });
  }
}

export interface ClaudeCliBackendOptions {
  /** The resolved binary (see resolveClaudeBinary). */
  binary: { path: string; version?: string };
  /** Optional wrapper (e.g. bwrap, or `node` for a test double); the binary becomes its argument. */
  launcher?: { command: string; args: string[] };
  /** Base environment before sanitising (default process.env). */
  baseEnv?: Record<string, string | undefined>;
  envSet?: Record<string, string>;
  clientApp?: string;
  hookRuntime?: HookRuntime;
  guardScriptPath?: string;
  /** Refuse anything but a claude.ai subscription login (default true). */
  requireSubscription?: boolean;
  /** Refuse to run unless the CLI lists the path guard (default true). */
  verifyHooks?: boolean;
  /** Run the path guard once on synthetic calls before the CLI starts, refusing on failure (default true). */
  selfTestGuard?: boolean;
  /**
   * The CLI's own fences as a second layer behind the hook (default true): --restricted plus
   * blockReads/WritesOutsideWorkingDirectories and Read/Edit deny rules for hidden entries (which
   * the CLI also applies to Grep and Glob) in the settings.
   * Off only to test the hook alone (they may refuse a call before the hook sees it).
   */
  cliFences?: boolean;
  includePartialMessages?: boolean;
  /** Add --include-hook-events, so guard decisions show up in the stream (default true). */
  includeHookEvents?: boolean;
  /** Add --permission-prompts none (default true). */
  permissionPromptsNone?: boolean;
  controlTimeoutMs?: number;
  closeGraceMs?: number;
  toolServer?: Omit<ToolServerOptions, 'host'>;
}

export interface PreparedLaunch {
  command: string;
  args: string[];
  /** The Claude CLI flags alone (args minus any launcher). */
  claudeArgs: string[];
  cwd: string;
  env: Record<string, string>;
  envReport: { removed: string[]; set: Record<string, string>; restored: string[] };
  files: ConfinementFiles & { mcpConfigPath: string; systemPromptPath: string };
  /** The id the session will have: fixed for a new session, the old one when resuming. */
  sessionId: string;
  resuming: boolean;
}

export interface PreflightReport {
  auth: AuthInfo;
  /** The path guard run on synthetic calls before the CLI started. */
  guardSelfTest?: GuardSelfTest;
  hooks?: HookVerification;
  version?: string;
  /** Raw get_hooks_listing reply, kept for diagnostics. */
  hooksListing?: unknown;
}

export class ClaudeCliBackend implements LlmBackend {
  readonly id = 'claude-cli' as const;
  readonly caps: BackendCaps = { builtinFileTools: true, subscriptionAuth: true, resume: true, interrupt: true };
  readonly options: ClaudeCliBackendOptions;

  constructor(options: ClaudeCliBackendOptions) {
    this.options = options;
  }

  /** Writes the run's config files and computes argv and env without starting the CLI. */
  async prepare(cfg: SessionConfig, toolServer: ToolServer): Promise<PreparedLaunch> {
    const o = this.options;
    const cliFences = o.cliFences ?? true;
    const confinementOpts: Parameters<typeof writeConfinementFiles>[0] = { runDir: cfg.runDir, shadowDir: cfg.cwd, cliFences };
    if (o.guardScriptPath !== undefined) confinementOpts.guardScriptPath = o.guardScriptPath;
    if (o.hookRuntime !== undefined) confinementOpts.runtime = o.hookRuntime;
    const confinement = await writeConfinementFiles(confinementOpts);
    const runDir = path.dirname(confinement.settingsPath);
    const mcpConfigPath = path.join(runDir, 'mcp-config.json');
    const systemPromptPath = path.join(runDir, 'system-prompt.md');
    // The MCP config holds the bearer token: owner-only.
    await writeFile(mcpConfigPath, `${JSON.stringify(toolServer.mcpConfigDocument(), null, 2)}\n`, { mode: 0o600 });
    await writeFile(systemPromptPath, cfg.systemPrompt, { mode: 0o600 });
    const resuming = cfg.resumeSessionId !== undefined;
    const sessionId = cfg.resumeSessionId ?? cfg.sessionId ?? randomUUID();
    const claudeArgs = buildClaudeArgs({
      model: cfg.model,
      effort: cfg.effort,
      thinking: cfg.thinking,
      maxTurns: cfg.maxTurns,
      maxBudgetUsd: cfg.maxBudgetUsd,
      systemPromptFile: systemPromptPath,
      settingsFile: confinement.settingsPath,
      mcpConfigFile: mcpConfigPath,
      sessionId: resuming ? undefined : sessionId,
      resumeSessionId: cfg.resumeSessionId,
      restricted: cliFences,
      includePartialMessages: o.includePartialMessages ?? false,
      includeHookEvents: o.includeHookEvents ?? true,
      permissionPromptsNone: o.permissionPromptsNone ?? true,
    });
    // 2k2 (D2-113): git from ws/ finds no repository above the run folder (the model's own included); set last, so no
    // caller's envSet can lift it.
    const sanitizeOpts: Parameters<typeof sanitizeClaudeEnv>[1] = { set: { ...(o.envSet ?? {}), ...gitCeilingEnv(confinement.rootReal) } };
    if (o.clientApp !== undefined) sanitizeOpts.clientApp = o.clientApp;
    const sanitized = sanitizeClaudeEnv(o.baseEnv ?? process.env, sanitizeOpts);
    const command = o.launcher?.command ?? o.binary.path;
    const args = o.launcher ? [...o.launcher.args, o.binary.path, ...claudeArgs] : claudeArgs;
    return {
      command,
      args,
      claudeArgs,
      cwd: confinement.rootReal,
      env: sanitized.env,
      envReport: { removed: sanitized.removed, set: sanitized.set, restored: sanitized.restored },
      files: { ...confinement, mcpConfigPath, systemPromptPath },
      sessionId,
      resuming,
    };
  }

  async startSession(cfg: SessionConfig): Promise<ClaudeCliSession> {
    const o = this.options;
    // Quota tripwire first, before any file, server or process exists: under TELELEAN_NO_REAL_CLAUDE=1 only M0's
    // node double (launched with this very Node binary) may start; a real CLI never does.
    if (realClaudeDisabled() && !isTestDoubleLaunch(o.launcher?.command, o.binary.path)) {
      throw new LlmHarnessError(
        'process',
        `Refusing to start the Claude CLI: ${NO_REAL_CLAUDE_ENV}=${process.env[NO_REAL_CLAUDE_ENV] ?? ''} is set (tests and dry runs never start a real Claude; only a test double in a test fixtures folder, launched with ${process.execPath}, may run).`,
      );
    }
    const toolServer = await startToolServer({ ...(o.toolServer ?? {}), host: cfg.toolHost });
    let session: ClaudeCliSession | undefined;
    try {
      const launch = await this.prepare(cfg, toolServer);
      let guardSelfTest: GuardSelfTest | undefined;
      if (o.selfTestGuard ?? true) {
        guardSelfTest = await selfTestGuard(launch.files, { env: launch.env });
        if (!guardSelfTest.ok) {
          throw new LlmHarnessError(
            'confinement',
            `Refusing to run: the path guard does not work as installed (${guardSelfTest.problems.join('; ')}).`,
          );
        }
      }
      const child = spawn(launch.command, launch.args, {
        cwd: launch.cwd,
        env: launch.env,
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: true, // own process group, so close() can end the whole tree
      });
      session = new ClaudeCliSession(child, launch, toolServer, {
        controlTimeoutMs: o.controlTimeoutMs ?? 30_000,
        closeGraceMs: o.closeGraceMs ?? 5_000,
        requireSubscription: o.requireSubscription ?? true,
      });
      await session.preflight({
        verifyHooks: o.verifyHooks ?? true,
        title: cfg.title ?? 'telelean run',
        ...(guardSelfTest ? { guardSelfTest } : {}),
      });
      return session;
    } catch (err) {
      if (session) await session.close({ force: true });
      else await toolServer.close();
      throw err;
    }
  }
}

export interface ClaudeCliSessionOptions {
  controlTimeoutMs: number;
  closeGraceMs: number;
  requireSubscription: boolean;
}

export class ClaudeCliSession implements LlmSession {
  readonly launch: PreparedLaunch;
  readonly toolServer: ToolServer;
  /** Resolves when the CLI process has exited (or failed to start). */
  readonly exited: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
  preflightReport: PreflightReport | undefined;

  private readonly child: ChildProcess;
  private readonly opts: ClaudeCliSessionOptions;
  private readonly splitter = new LineSplitter();
  private readonly normalizer = new StreamNormalizer();
  private readonly listeners = new Set<(e: LlmEvent) => void>();
  private readonly pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();
  private turn: AsyncQueue<LlmEvent> | undefined;
  private currentSessionId: string | undefined;
  private exitInfo: { code: number | null; signal: NodeJS.Signals | null } | undefined;
  private stderrTail = '';
  private controlSeq = 0;
  private closing: Promise<void> | undefined;

  constructor(child: ChildProcess, launch: PreparedLaunch, toolServer: ToolServer, opts: ClaudeCliSessionOptions) {
    this.child = child;
    this.launch = launch;
    this.toolServer = toolServer;
    this.opts = opts;
    this.currentSessionId = launch.sessionId;
    trackSession(this);
    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => this.onStdout(chunk));
    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (chunk: string) => this.onStderr(chunk));
    child.stdin?.on('error', () => {}); // EPIPE after the CLI exited; reported through `exited`
    this.exited = new Promise((resolve) => {
      const done = (code: number | null, signal: NodeJS.Signals | null): void => {
        if (this.exitInfo) return;
        this.exitInfo = { code, signal };
        liveSessions.delete(this);
        this.onExit();
        resolve(this.exitInfo);
      };
      child.once('exit', done);
      child.once('error', (err) => {
        this.stderrTail += `\n[spawn error] ${err.message}`;
        done(null, null);
      });
    });
  }

  get sessionId(): string | undefined {
    return this.currentSessionId;
  }

  get pid(): number | undefined {
    return this.child.pid;
  }

  get hasExited(): boolean {
    return this.exitInfo !== undefined;
  }

  get stderr(): string {
    return this.stderrTail;
  }

  onEvent(listener: (e: LlmEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Sends a control request and waits for its control_response. */
  control(subtype: string, extra: Record<string, unknown> = {}, timeoutMs = this.opts.controlTimeoutMs): Promise<unknown> {
    if (this.exitInfo) return Promise.reject(this.exitError(`control request ${subtype}`));
    this.controlSeq += 1;
    const requestId = `telelean-${this.controlSeq}-${randomBytes(3).toString('hex')}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new LlmHarnessError('protocol', `no reply to control request ${subtype} within ${timeoutMs} ms`));
      }, timeoutMs);
      timer.unref();
      this.pending.set(requestId, { resolve, reject, timer });
      this.writeLine({ type: 'control_request', request_id: requestId, request: { subtype, ...extra } });
    });
  }

  /** Auth and confinement checks; run by the backend before the first turn. */
  async preflight(opts: { verifyHooks: boolean; title?: string; guardSelfTest?: GuardSelfTest }): Promise<PreflightReport> {
    const init = await this.control('initialize', opts.title !== undefined ? { title: opts.title } : {});
    const initRec = isRec(init) ? init : {};
    const auth = classifyAuth(initRec.account);
    const report: PreflightReport = { auth };
    if (opts.guardSelfTest) report.guardSelfTest = opts.guardSelfTest;
    const version = str(initRec.claude_code_version);
    if (version !== undefined) report.version = version;
    this.preflightReport = report;
    this.emit({ type: 'auth', auth });
    if (this.opts.requireSubscription && auth.verdict !== 'subscription') {
      throw new LlmHarnessError(
        'auth',
        `Refusing to run: the Claude CLI is not on a claude.ai subscription login (${describeAuth(auth)}).`,
      );
    }
    if (opts.verifyHooks) {
      const listing = await this.control('get_hooks_listing');
      report.hooksListing = listing;
      report.hooks = verifyHooksListing(listing, {
        guardScriptPath: this.launch.files.guardScriptPath,
        policyPath: this.launch.files.policyPath,
      });
      if (!report.hooks.ok) {
        throw new LlmHarnessError('confinement', `Refusing to run: ${report.hooks.problems.join('; ')}.`);
      }
    }
    return report;
  }

  send(turn: string): AsyncIterable<LlmEvent> {
    if (this.closing || this.exitInfo) throw new LlmHarnessError('closed', 'the session is closed');
    if (this.turn) throw new LlmHarnessError('busy', 'a turn is already running');
    const queue = new AsyncQueue<LlmEvent>();
    this.turn = queue;
    this.writeLine({
      type: 'user',
      message: { role: 'user', content: turn },
      parent_tool_use_id: null,
      uuid: randomUUID(),
    });
    return queue;
  }

  async interrupt(): Promise<void> {
    if (this.exitInfo) return;
    await this.control('interrupt');
  }

  /** Signals the CLI's whole process group (it was spawned detached). */
  killProcessTree(signal: NodeJS.Signals): void {
    const pid = this.child.pid;
    if (pid === undefined || this.exitInfo) return;
    try {
      process.kill(-pid, signal);
    } catch {
      try {
        this.child.kill(signal);
      } catch {
        // already gone
      }
    }
  }

  close(opts: { force?: boolean } = {}): Promise<void> {
    this.closing ??= (async () => {
      if (!this.exitInfo && !opts.force) {
        if (this.turn) await this.interrupt().catch(() => {});
        await this.control('end_session', {}, 3_000).catch(() => {});
        this.child.stdin?.end();
        await Promise.race([this.exited, delay(this.opts.closeGraceMs)]);
      }
      if (!this.exitInfo) {
        this.killProcessTree('SIGTERM');
        await Promise.race([this.exited, delay(2_000)]);
      }
      if (!this.exitInfo) {
        this.killProcessTree('SIGKILL');
        await Promise.race([this.exited, delay(2_000)]);
      }
      liveSessions.delete(this);
      await this.toolServer.close();
    })();
    return this.closing;
  }

  // -------------------------------------------------------------------------------------------

  private writeLine(obj: unknown): void {
    if (this.exitInfo || !this.child.stdin || this.child.stdin.destroyed) return;
    this.child.stdin.write(`${JSON.stringify(obj)}\n`);
  }

  private emit(event: LlmEvent): void {
    for (const l of this.listeners) {
      try {
        l(event);
      } catch {
        // a listener's failure must not break the stream
      }
    }
    const turn = this.turn;
    if (!turn) return;
    turn.push(event);
    if (event.type === 'result' || (event.type === 'error' && event.fatal)) {
      turn.end();
      this.turn = undefined;
    }
  }

  private onStdout(chunk: string): void {
    for (const line of this.splitter.push(chunk)) {
      for (const item of this.normalizer.line(line)) this.dispatch(item);
    }
  }

  private dispatch(item: StreamItem): void {
    switch (item.kind) {
      case 'event': {
        const e = item.event;
        if (e.type === 'init') {
          if (e.sessionId) this.currentSessionId = e.sessionId;
          if (this.opts.requireSubscription && e.apiKeySource !== undefined && e.apiKeySource !== 'none') {
            this.emit(e);
            this.emit({
              type: 'error',
              fatal: true,
              code: 'auth',
              message: `Stopping: the CLI reports an API key in use (apiKeySource=${e.apiKeySource}).`,
            });
            void this.close({ force: true });
            return;
          }
        }
        this.emit(e);
        return;
      }
      case 'control_response': {
        const p = this.pending.get(item.requestId);
        if (!p) return;
        this.pending.delete(item.requestId);
        clearTimeout(p.timer);
        if (item.ok) p.resolve(item.response);
        else p.reject(new LlmHarnessError('protocol', `control request failed: ${item.error}`));
        return;
      }
      case 'control_request':
        // telelean registers no SDK hooks, permission handler or SDK MCP servers.
        this.writeLine({
          type: 'control_response',
          response: { subtype: 'error', request_id: item.requestId, error: `telelean does not handle ${item.subtype}` },
        });
        return;
      default:
        return;
    }
  }

  private onStderr(chunk: string): void {
    this.stderrTail = (this.stderrTail + chunk).slice(-8_000);
    this.emit({ type: 'stderr', text: chunk.length > 2_000 ? `${chunk.slice(0, 2_000)}…` : chunk });
  }

  private exitError(what: string): LlmHarnessError {
    const info = this.exitInfo;
    const how = info ? `code ${String(info.code)}, signal ${String(info.signal)}` : 'unknown';
    const tail = this.stderrTail.trim();
    return new LlmHarnessError('process', `the Claude CLI exited (${how}) before ${what}${tail ? `; stderr: ${tail.slice(-1_500)}` : ''}`);
  }

  private onExit(): void {
    for (const line of this.splitter.flush()) {
      for (const item of this.normalizer.line(line)) this.dispatch(item);
    }
    for (const [id, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(this.exitError('replying to a control request'));
      this.pending.delete(id);
    }
    if (this.turn) this.emit({ type: 'error', fatal: true, code: 'process', message: this.exitError('the turn ended').message });
    // Nobody can collect tool results any more: closing the server aborts pending calls, which
    // orphans a waiting ask_user (its answer then goes into the resumed session's next turn).
    void this.toolServer.close();
  }
}
