// Provider-agnostic LLM harness types (03 §8.1 "the slot", §8.3 agent tools, §8.6 outcomes).
//
// Every backend (the Claude Code CLI today, a fake for tests, an API-key backend later) implements
// LlmBackend / LlmSession and reports normalized LlmEvents. The agent's tools are one
// AgentToolHost implementation that every backend exposes in its own way (the CLI backend serves
// it over a loopback MCP server; the fake backend calls it directly).

export type BackendId = 'claude-cli' | 'fake' | 'claude-agent-sdk' | 'anthropic-api';
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';
export type ThinkingMode = 'enabled' | 'adaptive' | 'disabled';

export interface BackendCaps {
  /** The backend brings its own file tools (Read/Glob/Grep/Edit/Write), confined to the shadow. */
  builtinFileTools: boolean;
  /** Runs on the user's own subscription login, never on per-token API billing. */
  subscriptionAuth: boolean;
  /** A session can be resumed by id after its process is gone (window reload). */
  resume: boolean;
  /** A running turn can be interrupted without ending the session. */
  interrupt: boolean;
}

export interface LlmBackend {
  readonly id: BackendId;
  readonly caps: BackendCaps;
  startSession(cfg: SessionConfig): Promise<LlmSession>;
}

export interface SessionConfig {
  /** Shadow workspace: the agent's working directory. Its file tools are confined to it. */
  cwd: string;
  /** Private per-run directory for generated config files and logs. Must not be inside `cwd`. */
  runDir: string;
  systemPrompt: string;
  model: string;
  effort?: Effort;
  thinking?: ThinkingMode;
  /** Agentic turns per user turn (the CLI's --max-turns). */
  maxTurns?: number;
  /** Client-side cost-estimate cap per process (the CLI's --max-budget-usd). */
  maxBudgetUsd?: number;
  /** Continue an earlier session (for example after a window reload) instead of starting anew. */
  resumeSessionId?: string;
  /** Fix the id (a UUID) of a new session, so that it is known before the backend reports it. */
  sessionId?: string;
  toolHost: AgentToolHost;
  /** Short label used as the session title and in logs. */
  title?: string;
}

export interface LlmSession {
  /** Known up front for a new session with a fixed id or a resumed one; else after `init`. */
  readonly sessionId: string | undefined;
  /** Sends one user turn. Yields its events and ends after the turn's `result` or a fatal error. */
  send(turn: string): AsyncIterable<LlmEvent>;
  /** Stops the current turn; the session stays usable. */
  interrupt(): Promise<void>;
  /** Ends the session and its whole process tree. `force` skips the graceful phase. */
  close(opts?: { force?: boolean }): Promise<void>;
  /** Every event, including those outside a send() (hooks, retries, stderr). Returns unsubscribe. */
  onEvent(listener: (event: LlmEvent) => void): () => void;
}

// ---------------------------------------------------------------------------------------------
// Normalized events

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
}

export interface ModelUsageSummary extends TokenUsage {
  /** Client-side estimate at API list prices. A subscription is not billed per token. */
  costEstimateUsd: number;
}

export type AuthVerdict =
  | 'subscription' // claude.ai login with a subscription: the only verdict telelean runs on
  | 'api-key' // an API key would be billed per token
  | 'oauth-token' // a long-lived token from the environment (CLAUDE_CODE_OAUTH_TOKEN …)
  | 'third-party' // Bedrock, Vertex, Foundry, a gateway …
  | 'unknown';

export interface AuthInfo {
  verdict: AuthVerdict;
  /** From the CLI init message: where an API key came from; "none" means no API key is in use. */
  apiKeySource?: string;
  /** From the initialize handshake: "firstParty", "bedrock", "vertex", "foundry", … */
  apiProvider?: string;
  /** claude.ai subscription type ("pro", "max", …), present for subscription logins. */
  subscriptionType?: string;
  /** Present when the token did not come from the claude.ai login (e.g. CLAUDE_CODE_OAUTH_TOKEN). */
  tokenSource?: string;
  /** Whether the account reports an email address. The address itself is never kept. */
  hasEmail?: boolean;
}

export type ResultStatus = 'success' | 'error' | 'max_turns' | 'max_budget' | 'interrupted';

export interface InitEvent {
  type: 'init';
  sessionId: string;
  model: string;
  cwd?: string;
  tools: string[];
  mcpServers: Array<{ name: string; status: string }>;
  mcpServerErrors?: unknown[];
  permissionMode?: string;
  apiKeySource?: string;
  version?: string;
  capabilities?: string[];
}

export interface ResultEvent {
  type: 'result';
  status: ResultStatus;
  isError: boolean;
  sessionId: string;
  numTurns: number;
  durationMs: number;
  durationApiMs?: number;
  text?: string;
  usage: TokenUsage;
  /** The CLI's client-side cost estimate (API list prices), cumulative for a resumed session. */
  costEstimateUsd: number;
  modelUsage: Record<string, ModelUsageSummary>;
  permissionDenials: Array<{ toolName: string; toolUseId: string }>;
  errors: string[];
  stopReason?: string | null;
  terminalReason?: string;
}

export type LlmEvent =
  | InitEvent
  | { type: 'auth'; auth: AuthInfo }
  | { type: 'assistant_text'; text: string; messageId?: string; parentToolUseId?: string | null }
  | { type: 'thinking'; text: string; messageId?: string }
  | { type: 'text_delta'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown; messageId?: string }
  | { type: 'tool_result'; toolUseId: string; isError: boolean; text: string }
  /** One per API response (deduplicated by message id), from the assistant message's usage. */
  | { type: 'usage'; messageId: string; model?: string; usage: TokenUsage; parentToolUseId?: string | null }
  | { type: 'tool_progress'; toolUseId: string; toolName: string; elapsedSeconds: number }
  | { type: 'permission_denied'; toolName?: string; toolUseId?: string; message?: string }
  | {
      type: 'hook';
      phase: 'started' | 'progress' | 'response';
      hookEvent?: string;
      hookName?: string;
      outcome?: string;
      exitCode?: number;
      output?: string;
    }
  | { type: 'retry'; attempt: number; maxRetries: number; delayMs: number; error: string; status: number | null }
  | { type: 'rate_limit'; info: Record<string, unknown> }
  | ResultEvent
  | { type: 'error'; message: string; fatal: boolean; code?: string }
  | { type: 'stderr'; text: string }
  /** Anything the normalizer does not know yet (forward compatibility). */
  | { type: 'other'; rawType: string; subtype?: string; raw: Record<string, unknown> };

export type LlmEventType = LlmEvent['type'];

// ---------------------------------------------------------------------------------------------
// Agent tools (03 §8.3). Argument names follow the tool schemas the model sees.

/** D-20 phenomenon tags for clarifying questions. */
export const PHENOMENA = [
  'enthymeme',
  'genericity',
  'modality',
  'negation',
  'presupposition',
  'scalar',
  'vagueness',
  'evaluative-standard',
  'indexical',
  'word-sense',
  'tense',
  'granularity',
  'closed-world',
  'other',
] as const;
export type Phenomenon = (typeof PHENOMENA)[number];

export interface AskUserOption {
  label: string;
  /** Plain-language consequence of choosing this option. */
  consequence: string;
  /** Optional Lean rendering of what the option would formalise to. */
  formalPreview?: string;
}

export interface AskUserQuestion {
  phenomenon: Phenomenon;
  question: string;
  /** 2–4 options. "Leave it open" and free text are always offered by the UI as well. */
  options: AskUserOption[];
  /** Claude's own guess, revealed to the user only after they answer (no pre-selected answer). */
  claudesGuess?: { option?: number; note?: string };
  /** Node ids the answer affects. */
  affectedNodes?: string[];
}

export interface AskUserArgs {
  /** 1–3 questions per batch (D-20 budget). */
  questions: AskUserQuestion[];
}

export type AnswerChoice =
  | { kind: 'option'; option: number }
  | { kind: 'free-text'; text: string }
  | { kind: 'leave-open' }
  | { kind: 'decide-for-me' };

export interface Answer {
  /** Index into AskUserArgs.questions. */
  question: number;
  choice: AnswerChoice;
  /** D-20 scope chosen by the user. */
  scope?: 'run' | 'nodes' | 'subject';
}

export interface Answers {
  answers: Answer[];
  answeredAt: string;
}

export interface CheckLeanArgs {
  /** Shadow-relative files; validated to lie inside the shadow; default: the run's targets. */
  files?: string[];
}

export interface LeanDiagnostic {
  file: string;
  line: number;
  column: number;
  severity: 'error' | 'warning' | 'information';
  message: string;
}

export interface CheckResult {
  ok: boolean;
  diagnostics: LeanDiagnostic[];
  /** Per-declaration axiom footprints. */
  footprints: Record<string, string[]>;
  /** Rule violations (G0 denylist, vocabulary rule, proof body before the freeze, …). */
  violations: string[];
  note?: string;
  /** M2: the round's stage when the check ran (D-19). */
  stage?: 'formalise' | 'prove';
  /** M2: Lean checks left in this round (cap 25 by default). */
  checksLeft?: number;
  /** M2: telelean could not run Lean (sandbox, low memory): not the agent's fault; try again later or finish. */
  environment?: string;
}

export interface FreezeStatementsArgs {
  targets: string[];
}

export interface FreezeResult {
  frozen: boolean;
  /** Why the freeze was refused (G0, G1, G3, vocabulary rule …); empty when frozen. */
  refusals: string[];
  snapshotId?: string;
  /** M2: the permitted axioms of this freeze (D-5), so the agent knows what it may use. */
  permitted?: string[];
}

export interface ProposeAssumptionArgs {
  natural_name: string;
  lean_statement: string;
  why_needed: string;
  /**
   * M2 (D-6 "a gate-checked proof that it closes the gap"): a Lean term of type `(<lean_statement>) → <target>`,
   * e.g. `fun h => h cynder newSpyro (pg_no_dark_past.holds newSpyro cynder new_spyro_pg.holds cynder_dark_past.holds)`.
   * telelean checks it in a scratch module of the build mirror (never in the agent's files).
   */
  proof: string;
  /** M2: preferred snake_case statement name if the user adopts it (telelean derives one when absent or taken). */
  lean_name?: string;
}

export interface Adoption {
  status: 'recorded' | 'rejected';
  ghostId?: string;
  /** Whether the gate checked that the proposal closes the gap. */
  gateChecked: boolean;
  message: string;
  /** M2 (D-6): the gap proof uses none of the selected premises: the suggestion alone gives the target (flagged to the user). */
  aloneEntails?: boolean;
}

export type FinishStatus = 'proved' | 'insufficient' | 'inconsistent' | 'not_proved' | 'lean_errors';

export interface FinishArgs {
  status: FinishStatus;
  summary: string;
  gap?: string;
  conflict?: string[];
  unused?: string[];
  assumed_without_asking: string[];
}

/**
 * Programmatic (non-LLM) checks run each time the agent claims to be finished (amendment 2). M2 adds `markup` (G5),
 * `vocabulary` (the simple D-3 shape rule, new axioms) and `not_frozen` (finish(proved) without a freeze in the round);
 * docs/m2-plan.md section 3.5 maps every core `GateFindingCode` to one of these.
 */
export type GateCheckId = 'footprint' | 'no_sorry' | 'statement_unchanged' | 'build' | 'lint' | 'other' | 'markup' | 'vocabulary' | 'not_frozen';

export interface GateFailure {
  check: GateCheckId;
  detail: string;
}

export interface GateVerdict {
  passed: boolean;
  failures: GateFailure[];
  /** New definitions in this run. Never a failure by themselves: they are flagged for the user. */
  flaggedDefinitions: string[];
  /** 1-based count of finish calls in this run. */
  attempt: number;
  /** Re-prompt cap (default 3). */
  maxAttempts: number;
  /**
   * accept:  the gate passed; the turn ends.
   * retry:   the gate failed; the failures go back to the agent, which fixes them and calls finish again.
   * give_up: the cap is reached; the agent must stop; the host tells the user and reverts the
   *          shadow to the last safe state.
   */
  next: 'accept' | 'retry' | 'give_up';
  /**
   * M2: telelean could not run the checks (sandbox could not start, low memory). Not counted as an attempt; with
   * `next: 'give_up'` the run ends as `failed` and the user is told why (docs/m2-plan.md section 3.6).
   */
  environment?: string;
}

export interface ToolCallContext {
  /** Aborted when the agent side cancels the call or goes away (for example the CLI was killed). */
  signal: AbortSignal;
  /** Transport-level session (the MCP session), not the LLM session. */
  transportSessionId?: string;
  requestId?: string | number;
}

/** One implementation, used by every backend and by the fake (03 §8.1). */
export interface AgentToolHost {
  check_lean(args: CheckLeanArgs, ctx: ToolCallContext): Promise<CheckResult>;
  freeze_statements(args: FreezeStatementsArgs, ctx: ToolCallContext): Promise<FreezeResult>;
  ask_user(args: AskUserArgs, ctx: ToolCallContext): Promise<Answers>;
  propose_assumption(args: ProposeAssumptionArgs, ctx: ToolCallContext): Promise<Adoption>;
  finish(args: FinishArgs, ctx: ToolCallContext): Promise<GateVerdict>;
}

export type AgentToolName = keyof AgentToolHost;

// ---------------------------------------------------------------------------------------------

export type HarnessErrorCode =
  | 'auth' // not running on the user's subscription
  | 'confinement' // the file-tool guard is not active
  | 'binary' // no usable Claude Code binary
  | 'protocol' // unexpected stream or control-protocol data
  | 'process' // the backend process died or could not start
  | 'busy' // a turn is already running
  | 'closed'; // the session is closed

export class LlmHarnessError extends Error {
  readonly code: HarnessErrorCode;
  constructor(code: HarnessErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'LlmHarnessError';
    this.code = code;
  }
}
