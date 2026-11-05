# r1-claude-slot: R1: Slotting Claude (via the user's Claude subscription) into the telelean VS Code extension

## Summary
The Claude Agent SDK for TypeScript (@anthropic-ai/claude-agent-sdk, latest 0.3.316, whose manifest pairs it with Claude Code CLI 2.1.316) is ESM-only, needs Node >=18.14, has no runtime dependencies, and does not bundle cli.js. It spawns a per-platform native Claude Code binary from exact-version optionalDependencies (about 330 MB each). Its LICENSE.md reads 'All rights reserved' and points to Anthropic's Legal Agreements, so it is not open source. The API was checked against sdk.d.ts: query({prompt, options}) returns a Query with about 30 control methods; Options has roughly 75 keys including canUseTool, hooks, mcpServers, settingSources, sandbox, effort, thinking, resume and enableFileCheckpointing; SDKMessage is a 39-member union; createSdkMcpServer and tool() build in-process MCP tools; AskUserQuestion reaches the host through canUseTool and is answered via updatedInput.answers.

Auth and policy. With no ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, apiKeyHelper or CLAUDE_CODE_OAUTH_TOKEN in the child environment, the spawned CLI falls through to the /login subscription credential (documented precedence step 7), so the extension never needs to touch credentials. Two traps: options.env replaces the whole environment when set, so keys must be stripped explicitly; and CLAUDE_CONFIG_DIR relocates the credential file, so pointing it at a shadow directory signs the agent out. The Agent SDK overview says that unless previously approved, Anthropic does not allow third-party developers to offer claude.ai login or rate limits for their products. The legal page says developers building products should use API keys, but that it does not prevent an end user from signing in to the unmodified Claude Code binary with their own subscription. My inference: a personal tool that runs the unmodified official binary, signed in by the user, with no token handling and no distribution, is the compliant route. Sharing with others needs per-user API keys or written approval from Anthropic. Driving claude -p stream-json runs the same binary and protocol, so it is not a policy escape hatch.

Clarifying questions and containment. Recommended: built-in AskUserQuestion routed through canUseTool with permissionMode 'default'. The callback has no timeout. Add a PreToolUse 'defer' flow only if the process must survive a window reload (-p/SDK only, one tool call per turn, resume by session id). An in-process ask_user MCP tool is also viable (SDK in-process servers are exempt from the MCP idle timeout; MCP_TOOL_TIMEOUT defaults to about 28 hours) but is free-form and untrained. Containment: settingSources [] (omitting it loads user, project and local CLAUDE.md, settings, hooks and skills), explicit permissionMode, explicit tools, PreToolUse hooks for writes, and the Linux sandbox, which needs socat (not installed here). Critical: lean 4.35.0 ran '#eval IO.FS.writeFile' during elaboration (verified), so allowlisting 'Bash(lake env lean *)' is code execution, not containment; the sandbox and a read-only lakefile are the real boundary.

Provider slot and model. The SDK is the best Claude backend. The raw claude -p stream-json route speaks the same protocol but needs the control protocol implemented by hand. The Anthropic API tool runner (@anthropic-ai/sdk 1.3.0, client.beta.messages.toolRunner) gives an agent loop without built-in file or shell tools. The VS Code Language Model API has no Claude provider here. OpenAI-compatible endpoints are chat-with-tools only. Default model: claude-opus-5-5 (recommended for most work; default effort is medium, so set effort explicitly); claude-fable-5-1 is the higher tier, and its availability on the user's plan is unverified. Correction to the brief: the docs place Fable 5.1 above Opus 5.5. Nothing was run against a live login or API because node is not installed. REPORT.md was not written because the agent instructions prohibit report files.

## Recommendations
- **Claude backend packaging and which binary the SDK runs** → Depend on @anthropic-ai/claude-agent-sdk pinned to exactly 0.3.316. Let it run its own bundled native binary (do not set pathToClaudeCodeExecutable). Keep the SDK external and load it with a dynamic import() from the extension entry point rather than bundling it.
  - rationale: The bundled CLI matches the SDK version (no skew), uses the same credential store as the existing login, avoids the import.meta.url resolution hazard under esbuild, and keeps the roughly 330 MB binary out of any bundle.
  - alternatives: Point pathToClaudeCodeExecutable at a stable native launcher (~/.local/bin/claude from the native installer). Or point it at the extension binary, which works but breaks on extension update and carries version skew.
- **Credential handling** → The extension never reads, copies, relays or stores credentials. Build the child env by copying process.env and deleting ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, CLAUDE_CODE_OAUTH_TOKEN and CLAUDE_CONFIG_DIR. Do not use claude setup-token. Offer an API-key backend only as an explicit, separate choice.
  - rationale: Keeps the personal route inside the documented lane (unmodified binary, user signs in) and prevents silent metered billing when a key is set in the shell.
  - alternatives: Use ANTHROPIC_API_KEY (metered; unambiguous policy position) for anything shared with others.
- **Mid-run clarifying questions** → Use built-in AskUserQuestion via canUseTool with permissionMode 'default'. Render its questions as cards and return {behavior: 'allow', updatedInput: {questions, answers}}. Tell the model in the system prompt to ask one question set per turn with no other tool calls in that turn. Use defer only if process-exit survival matters.
  - rationale: Built in and typed (1 to 4 questions, 2 to 4 options, free text via an Other answer, optional previews), no callback timeout, no custom tool. defer needs a single tool call per turn and -p/SDK mode.
  - alternatives: (i) In-process ask_user MCP tool whose handler awaits a Promise the webview resolves: free-form, no SDK idle timeout, but custom and untrained. (iii) defer-and-resume: survives reloads, but single-call restriction and permission flags must be re-passed on resume.
- **Containment profile (untested sketch)** → // untested sketch; shadowDir is an absolute path to a copy of the Lean project
const env = { ...process.env, CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1', CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS: '0', ENABLE_CLAUDEAI_MCP_SERVERS: 'false', BASH_DEFAULT_TIMEOUT_MS: '600000' };
for (const k of ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN', 'CLAUDE_CONFIG_DIR']) delete env[k];
query({ prompt, options: {
  cwd: shadowDir, settingSources: [], strictMcpConfig: true, mcpServers: { telelean: teleleanTools }, env,
  permissionMode: 'default',
  tools: ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash', 'AskUserQuestion'],
  allowedTools: ['Read', 'Glob', 'Grep', 'Bash(lake build *)', 'Bash(lake env lean *)'],
  disallowedTools: ['WebFetch', 'WebSearch', 'Agent', 'Edit(lakefile*)'],
  sandbox: { enabled: true, failIfUnavailable: true, filesystem: { allowWrite: [shadowDir] }, network: { allowedDomains: [] } },
  hooks: { PreToolUse: [{ matcher: 'Write|Edit|NotebookEdit', hooks: [allowOnlyShadowLeanWrites] }] },
  canUseTool: routeAskUserQuestionOrDeny,
  model: 'claude-opus-5-5', effort: 'high',
  systemPrompt: { type: 'preset', preset: 'claude_code', append: TELELEAN_RULES, snapshot: true },
  enableFileCheckpointing: true, includePartialMessages: true } });
  - rationale: Each option is documented or present in sdk.d.ts. The sandbox is the real boundary for shell and Lean. PreToolUse hooks check file writes, which a Write|Edit matcher cannot do for Bash. settingSources [] removes user state. The lake/lean allowlist is acceptable only because the sandbox is on. MultiEdit is not a built-in tool name, so the matcher uses NotebookEdit instead.
  - alternatives: dontAsk is a hard deny but turns AskUserQuestion into a denial. auto adds a classifier and model calls.
- **Lean execution policy** → Treat lake and lean as arbitrary code execution. Run them only inside the sandbox with network off and writes limited to the shadow tree. Make lakefile*, lean-toolchain and non-.lean files read-only. As defense in depth, lint generated Lean for IO-capable constructs (#eval, run_cmd, initialize, IO.Process, unsafe), but do not rely on the lint.
  - rationale: Verified: #eval wrote a file during elaboration. lake build evaluates the lakefile, which is Lean code (inferred).
  - alternatives: Run the checker in a separate, stricter container or user namespace (Docker is not installed here).
- **Permission mode** → Set permissionMode explicitly to 'default'.
  - rationale: An omitted mode is ambiguous across CLI versions and settings. dontAsk denies AskUserQuestion, so it cannot coexist with the clarifying-question design.
  - alternatives: 'auto' for fewer prompts (classifier decides; adds model calls).
- **Model and effort defaults** → Default to claude-opus-5-5 at effort 'high', with 'xhigh' for hard proofs. Offer claude-fable-5-1 as a selectable option if the plan exposes it. Pin full model IDs. Do not copy the older example IDs from the SDK JSDoc.
  - rationale: Docs position Opus 5.5 for most work but default it to medium effort. Fable 5.1 sits above it for demanding reasoning.
  - alternatives: The 'opus' alias (tracks the newest Opus on the Anthropic API), or claude-sonnet-5-5 for cheaper iteration.
- **Provider-neutral interface** → export type EffortLevel = 'low' | 'medium' | 'high' | 'xhigh' | 'max';
export interface LlmBackend {
  readonly id: 'claude-agent-sdk' | 'claude-cli-stream' | 'anthropic-api' | 'vscode-lm' | 'openai-compat';
  readonly caps: { builtinFileTools: boolean; builtinShell: boolean; sandbox: boolean; nativeAskUser: boolean; deferResume: boolean; fileCheckpoints: boolean; subscriptionAuth: boolean };
  startSession(cfg: SessionConfig): Promise<LlmSession>;
}
export interface SessionConfig {
  workspaceDir: string; // shadow copy; the only writable tree
  model: string; effort?: EffortLevel; systemPrompt: string;
  allowedTools: string[]; disallowedTools: string[];
  hostTools: HostTool[]; // lean_check, graph_query, propose_changes, plus ask_user when nativeAskUser is false
  resumeSessionId?: string;
}
export interface LlmSession {
  send(userTurn: string): AsyncIterable<LlmEvent>; // yields until the turn ends
  answer(requestId: string, answers: Record<string, string>): Promise<void>;
  interrupt(): Promise<void>; setModel(model: string): Promise<void>; close(): Promise<void>;
}
export type LlmEvent =
  | { kind: 'text'; delta: string }
  | { kind: 'tool'; name: string; status: 'start' | 'end' | 'error'; input?: unknown; output?: unknown }
  | { kind: 'ask'; requestId: string; questions: AskQuestion[] }
  | { kind: 'usage'; inputTokens: number; outputTokens: number; costUsd?: number } // client-side estimate
  | { kind: 'done'; stopReason: string; sessionId: string; deferred?: { toolUseId: string; name: string; input: unknown } }
  | { kind: 'error'; message: string };
  - rationale: Capabilities differ by backend. The Agent SDK has built-in file and shell tools, sandbox, resume and defer. The Anthropic API and the VS Code LM API are chat-with-tools, so the host must implement file, shell and sandboxing. The LM API drops system messages and needs consent.
  - alternatives: Map the SDK events to this interface first; add other backends when needed.
- **Policy posture** → Keep the extension personal-use only, on the unmodified binary, or obtain Anthropic approval or API keys before anyone else uses it. Do not put Claude Code in the product name. Review the SDK's proprietary license before redistributing any part of it.
  - rationale: The Agent SDK note restricts third-party developers from offering claude.ai login. The legal page says developers building products should use API keys. The SDK is named explicitly in that policy, so using the CLI instead of the SDK is not a safe argument.
  - alternatives: Contact Anthropic sales to confirm the approach in writing.
- **Extension toolchain** → Install Node.js 22 LTS, esbuild, TypeScript, @types/vscode matching your engines.vscode target (npm latest 1.144.0), zod ^4 and @modelcontextprotocol/sdk ^1.29 (peers), and socat (sudo apt-get install socat; bubblewrap is already present).
  - rationale: node and npm are missing locally, socat is missing, and the SDK peers must be installed explicitly if in-process tools are used.
  - alternatives: Skip socat only if you accept unsandboxed runs (not recommended).

## Design decisions for user
- **Q:** Authentication route for the Claude backend
  - why: Subscription login is documented for ordinary individual use and costs nothing beyond the plan. An API key is metered and is the only route that clearly covers sharing the extension.
  - options: subscription (personal) | API key (metered, distribution-safe)
  - recommended: Subscription login for personal use; keep the API-key backend as an explicit option.
- **Q:** Mechanism for mid-run clarifying questions
  - why: Determines the UX and whether a run survives a window reload.
  - options: AskUserQuestion + canUseTool | + defer-and-resume | custom ask_user MCP tool (free-form)
  - recommended: AskUserQuestion via canUseTool now; add defer later if reload survival matters.
- **Q:** Permission posture
  - why: Trades prompt fatigue against predictability and extra model calls.
  - options: default | auto | dontAsk (incompatible with clarifying questions)
  - recommended: default
- **Q:** Default model and effort
  - why: Controls cost, latency and proof quality. Fable 5.1 availability on the user's plan is unverified.
  - options: Opus 5.5 | Fable 5.1 | Sonnet 5.5
  - recommended: claude-opus-5-5 at effort high, with claude-fable-5-1 selectable.
- **Q:** Which Claude Code binary the SDK runs
  - why: Governs version skew, install footprint and update behavior.
  - options: SDK-bundled | stable ~/.local/bin/claude launcher | extension binary path (fragile)
  - recommended: SDK-bundled binary (no pathToClaudeCodeExecutable).
- **Q:** Sandbox failure behavior
  - why: If the sandbox cannot start, failIfUnavailable false runs shell commands unsandboxed.
  - options: fail closed | degrade gracefully
  - recommended: Fail closed (failIfUnavailable true), after installing socat.
- **Q:** Distribution intent
  - why: Determines whether API keys or Anthropic's written approval are needed before anyone else uses the extension.
  - options: personal only | seek Anthropic approval | API-key distribution
  - recommended: Personal use only for now.

## Software needed
- Node.js 22 LTS or newer — Build toolchain and npm for the extension. The SDK needs Node >=18.14; the VS Code extension host runs its own Node. — install: nodejs.org installer or nvm. Not installed here (verified-locally). — required=True
- @anthropic-ai/claude-agent-sdk 0.3.316 (exact pin) — Claude backend; spawns the bundled native Claude Code CLI. — install: npm install --save-exact @anthropic-ai/claude-agent-sdk@0.3.316 — required=True
- zod ^4.0.0 — Peer dependency for tool() input schemas in in-process MCP tools. — install: npm install zod@^4 — required=True
- @modelcontextprotocol/sdk ^1.29.0 — Peer dependency for in-process MCP servers (createSdkMcpServer). — install: npm install @modelcontextprotocol/sdk@^1.29 — required=True
- @anthropic-ai/sdk >=0.93.0 (npm latest 1.3.0) — Peer dependency; needed only for an API-key backend using the Anthropic tool runner. — install: npm install @anthropic-ai/sdk — required=False
- socat distribution package — Relay used by the Linux sandbox network proxy. Missing here. — install: sudo apt-get install socat — required=True
- bubblewrap distribution package — Linux sandbox filesystem isolation. Already present at /usr/bin/bwrap and passes a namespace probe. — install: Already installed; sudo apt-get install bubblewrap only if missing — required=True
- esbuild current 0.x — Bundle the extension to CommonJS for the VS Code extension host, leaving the SDK external. — install: npm install -D esbuild — required=True
- TypeScript and @types/vscode @types/vscode matched to engines.vscode (npm latest 1.144.0) — Typed extension development and Language Model API typings. — install: npm install -D typescript @types/vscode — required=True
- Claude Code native CLI (optional) latest — Stable launcher for terminal use and an optional pathToClaudeCodeExecutable target. The SDK's bundled binary works without it. — install: curl -fsSL https://claude.ai/install.sh | bash — required=False
- Lean 4 toolchain (lean, lake) v4.35.0 (pin lean-toolchain in the project) — Target language for the telelean project; already installed via elan. — install: Already installed; no change needed — required=True

## Risks
- Policy exposure: if the extension is shared, or used at heavy automated scale on a subscription, it falls outside the documented individual-use lane. Plan limits assume ordinary individual use, and the consumer terms restrict automated access unless Anthropic permits it.
- Lean elaboration is code execution (verified with #eval). A model-written #eval or run_cmd can run any command the process can. A sandbox misconfiguration would expose the user's files.
- The sandbox will not start until socat is installed. With failIfUnavailable false it silently runs unsandboxed, and the SDK and CLI docs disagree on the default, so set it explicitly.
- Permission-mode drift: an omitted permissionMode may resolve to 'auto' on some CLI versions, changing which calls prompt.
- AskUserQuestion disappears under dontAsk or permissionPrompts 'none', and is unavailable to subagents.
- Auto-approved calls bypass canUseTool, so safety checks placed only there are skipped for allowlisted tools; use PreToolUse hooks for always-on checks.
- Extension reload, crash or deactivate kills the in-flight query and its pending canUseTool; only defer or persisted sessions can resume. Call close() on deactivate.
- Version skew and path fragility: the extension binary path embeds 2.1.314 and changes on extension update; the SDK does no version check.
- Bundling: CJS bundling can break the SDK's import.meta.url-based binary resolution. The SDK license is proprietary, which limits redistribution. Each platform binary is about 330 MB.
- Quality risk: Opus 5.5 defaults to medium effort; leaving effort unset degrades proof quality.
- Cost fields (total_cost_usd, maxBudgetUsd) are client-side estimates on subscription plans, not a bill. maxTurns is passed by the SDK but absent from the local CLI help.
- The default Bash timeout is 120000 ms, which can kill long lake builds.
- Stale documentation: SDK JSDoc example IDs and the model lineup change; re-check before shipping.
- Some policy quotes came through a summarizing fetch rather than byte-exact retrieval; re-check the live pages before quoting externally.

## Open questions
- Does the SDK-bundled binary reuse the existing /login credential with no re-login, with ANTHROPIC_API_KEY and related variables unset? Test in a clean child env.
- Do lake build and lake env lean run under the bwrap sandbox with writes limited to the shadow directory? Install socat first; check whether elan or Lake caches need writable paths.
- Does defer then resume work end to end through the SDK resume option, given that the SDK passes no explicit -p flag?
- Does an AskUserQuestion wait survive 30 or more minutes in the SDK? The docs say no timeout, but the control request could have an undocumented limit.
- Is claude-fable-5-1 available on the user's plan, and what does it cost in subscription usage?
- Which Node version does the VS Code 1.140 extension host run, and does a dynamic import() of the ESM-only SDK load there?
- Does the Anthropic tool runner have per-turn hooks? They are described in the brief but do not appear in the typings; check the API docs.
- Are the policy quotes byte-exact? Re-check the live pages before quoting externally.
- Do in-process MCP calls get auto-backgrounded under the chosen env? Set CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS=0 and test.
- REPORT.md was not written, per the agent instructions. The parent should decide whether a file is needed; the scratch folder holds the extracted SDK, the Lean probe and the CLI help output.

## Findings
- [verified-locally] Latest SDK is @anthropic-ai/claude-agent-sdk 0.3.316; its manifest pins Claude Code CLI 2.1.316 (build 2026-10-30).
  - evidence: npm /latest JSON; tarball integrity matched; tarball manifest.json version 2.1.316.
  - source: https://registry.npmjs.org/@anthropic-ai/claude-agent-sdk/latest
- [verified-locally] No cli.js is bundled. The CLI is a native binary in 8 exact-version optionalDependencies (linux-x64, linux-arm64, linux-x64-musl, linux-arm64-musl, darwin-x64, darwin-arm64, win32-x64, win32-arm64). The linux-x64 binary is about 328 MB. The main package has zero runtime dependencies.
  - evidence: package.json optionalDependencies; manifest.json platforms.linux-x64.size = 328262000.
- [verified-locally] ESM only: type module; main and types point to sdk.mjs and sdk.d.ts; exports has no require condition. engines.node >=18.14.0.
  - evidence: package.json of the extracted tarball.
- [verified-locally] Peer dependencies: @anthropic-ai/sdk >=0.93.0, @modelcontextprotocol/sdk ^1.29.0, zod ^4.0.0. zod is needed for tool() schemas.
  - evidence: package.json peerDependencies.
- [verified-locally] License is proprietary: LICENSE.md says © Anthropic PBC. All rights reserved, subject to the Legal Agreements. The overview says use is governed by Anthropic's Commercial Terms of Service.
  - evidence: LICENSE.md and package.json read locally; overview fetched.
  - source: https://code.claude.com/docs/en/agent-sdk/overview.md
- [verified-locally] Bundling hazard: sdk.mjs uses import.meta.url twice, including to locate the platform CLI package for the default executable. A CJS bundle can break that resolution ('Native CLI binary ... not found'). Keep the SDK external and dynamic-import it, or pass pathToClaudeCodeExecutable.
  - evidence: Code inspection of sdk.mjs; esbuild behavior not tested.
- [verified-locally] query(_params: { prompt: string | AsyncIterable<SDKUserMessage>; options?: Options }): Query; Query extends AsyncGenerator<SDKMessage, void>.
  - evidence: sdk.d.ts lines 2938 and 3345.
- [verified-locally] Options (about 75 keys): cwd, additionalDirectories, tools (string array or preset; [] disables built-ins), allowedTools, disallowedTools, toolConfig.askUserQuestion, canUseTool, permissionMode, permissionPrompts ('host' or 'none'), hooks, mcpServers, strictMcpConfig, settingSources, settings, sandbox, env (replaces the whole environment when set), model, fallbackModel, effort, thinking, maxTurns, maxBudgetUsd, systemPrompt, outputFormat, resume, resumeSessionAt, continue, forkSession, sessionId, persistSession, enableFileCheckpointing, includePartialMessages, plugins, skills, agents, onElicitation, onUserDialog, pathToClaudeCodeExecutable, spawnClaudeCodeProcess, executable, stderr, debug, projectConfigRoot.
  - evidence: sdk.d.ts Options type; keys extracted by script and checked against JSDoc.
- [documented] settingSources: when omitted, user, project and local are all loaded (CLAUDE.md, settings, hooks, skills, agents). [] disables them. Managed policy and ~/.claude.json are read regardless. Auto memory loads unless CLAUDE_CODE_DISABLE_AUTO_MEMORY=1. Parent-directory CLAUDE.md loads when project is included.
  - evidence: sdk.d.ts JSDoc; claude-code-features page.
  - source: https://code.claude.com/docs/en/agent-sdk/claude-code-features.md
- [documented] permissionMode when omitted is ambiguous: sdk.d.ts says auto where that is the default; the permissions page says v2.1.302+ starts in default unless set. Set it explicitly.
  - evidence: sdk.d.ts JSDoc; permissions page.
  - source: https://code.claude.com/docs/en/agent-sdk/permissions.md
- [documented] Permission order: 1 hooks; 2 deny rules; 3 ask rules; 4 permission mode; 5 allow rules (allowedTools); 6 canUseTool. Auto-approved calls never reach canUseTool; a hook allow does not skip deny or ask rules.
  - evidence: Permissions page evaluation section.
  - source: https://code.claude.com/docs/en/agent-sdk/permissions.md
- [documented] dontAsk denies AskUserQuestion and tools flagged requiresUserInteraction without calling canUseTool. permissionPrompts 'none' never calls canUseTool and removes AskUserQuestion. Default mode routes AskUserQuestion to canUseTool.
  - evidence: Permissions page dontAsk section; headless page.
  - source: https://code.claude.com/docs/en/headless.md
- [documented] AskUserQuestion via canUseTool: toolName 'AskUserQuestion'. Return {behavior: 'allow', updatedInput: {questions, answers}} with answers keyed by question text; multi-select as array or comma-joined; free text allowed. Limits: 1 to 4 questions, 2 to 4 options; not in subagents; must be in tools if tools is restricted. The callback may stay pending indefinitely.
  - evidence: user-input page; sdk-tools.d.ts AskUserQuestionInput and Output types.
  - source: https://code.claude.com/docs/en/agent-sdk/user-input.md
- [verified-locally] toolConfig.askUserQuestion.previewFormat ('markdown' or 'html') adds an optional preview per option.
  - evidence: sdk.d.ts ToolConfig type.
- [documented] defer: a PreToolUse hook returning permissionDecision 'defer' ends the turn with stop_reason 'tool_deferred' and deferred_tool_use {id, name, input}. Resume the session (claude -p --resume, or the SDK resume option); the hook then returns allow with updatedInput.answers. No timeout; sessions kept until cleanupPeriodDays (30 days). Restrictions: -p only; ignored with a warning when several tool calls occur in one turn; re-pass permission mode on resume.
  - evidence: Hooks page defer section (fetched via summarizer; wording approximate); sdk.d.ts SDKResultMessage.deferred_tool_use.
  - source: https://code.claude.com/docs/en/hooks#defer-a-tool-call-for-later
- [documented] Hooks: many events incl. PreToolUse, PostToolUse, PermissionRequest, Stop, SubagentStop, Elicitation; decision precedence deny > defer > ask > allow; default hook timeout 600 s for most events; a PreToolUse timeout blocks the call.
  - evidence: Agent SDK hooks page.
  - source: https://code.claude.com/docs/en/agent-sdk/hooks.md
- [documented] Hooks see every tool call including auto-approved ones and can allow, deny, ask, defer or rewrite input. A Write|Edit matcher does not catch Bash writes, so shell writes need the sandbox.
  - evidence: Agent SDK hooks page warning on .env example.
  - source: https://code.claude.com/docs/en/agent-sdk/hooks.md
- [verified-locally] Query control methods (about 30): interrupt, setPermissionMode, setModel, setMaxThinkingTokens, applyFlagSettings, supportedModels, mcpServerStatus, getContextUsage, rewindFiles(userMessageId), setMcpServers, streamInput(AsyncIterable<SDKUserMessage>), stopTask, close (forcibly ends the CLI subprocess).
  - evidence: sdk.d.ts Query interface.
- [verified-locally] File checkpointing: enableFileCheckpointing true, then query.rewindFiles(userMessageId) restores tracked files.
  - evidence: sdk.d.ts Options and Query JSDoc.
- [verified-locally] SDKMessage is a 39-member union including SDKAssistantMessage, SDKUserMessage, SDKResultMessage (total_cost_usd, usage, stop_reason, structured_output, deferred_tool_use), SDKSystemMessage (init), SDKPartialAssistantMessage, SDKHook*, SDKTask*, SDKPermissionDeniedMessage, SDKRateLimitEvent.
  - evidence: sdk.d.ts union at line 5604; result fields lines 5960 to 6121.
- [verified-locally] User messages: {type: 'user', message: MessageParam, parent_tool_use_id, priority?: 'now'|'next'|'later'}. streamInput() supports mid-run injection; interrupt() stops the turn.
  - evidence: sdk.d.ts SDKUserMessage and Query methods.
- [verified-locally] createSdkMcpServer({name, version?, tools?, alwaysLoad?, timeout?}) and tool(name, description, zodRawShape, handler(args, extra) returning CallToolResult, extras?). Tools are called mcp__<server>__<tool> and listed in allowedTools to skip prompts. The per-server timeout overrides MCP_TOOL_TIMEOUT.
  - evidence: sdk.d.ts lines 647 to 677 and 10182; custom-tools page.
  - source: https://code.claude.com/docs/en/agent-sdk/custom-tools.md
- [documented] MCP wait limits: MCP_TOOL_TIMEOUT unset is about 28 hours. CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT (300000 ms network, 1800000 ms stdio) does not apply to SDK in-process servers. CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS defaults to 120000; 0 disables. Non-interactive MCP calls are not auto-backgrounded unless CLAUDE_AUTO_BACKGROUND_TASKS=1. MCP_TIMEOUT startup wait is 30 s.
  - evidence: mcp, env-vars and headless pages (summarizer; wording approximate).
  - source: https://code.claude.com/docs/en/mcp.md
- [documented] Auth precedence: cloud provider env; ANTHROPIC_AUTH_TOKEN; ANTHROPIC_API_KEY (used without prompt in -p mode when present); apiKeyHelper; CLAUDE_CODE_OAUTH_TOKEN from claude setup-token; Anthropic profile; subscription OAuth from /login (default for Pro and Max). ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN and apiKeyHelper apply to the Agent SDK.
  - evidence: authentication page precedence list.
  - source: https://code.claude.com/docs/en/authentication.md
- [inferred] With no higher-precedence credential in the child env, the SDK-spawned CLI should use the /login subscription credential. Not executed here.
  - evidence: Follows from the precedence list.
- [documented] Credentials on Linux are ~/.claude/.credentials.json (0600). CLAUDE_CONFIG_DIR relocates that file and ~/.claude.json, so pointing it at a shadow directory signs the agent out. Bare mode never reads OAuth credentials, and the SDK passes no --bare (no quoted --bare argument in sdk.mjs).
  - evidence: authentication page; headless page; string search of sdk.mjs.
  - source: https://code.claude.com/docs/en/authentication.md
- [verified-locally] Extension CLI is 2.1.314 at ~/.vscode/extensions/anthropic.claude-code-2.1.314-linux-x64/resources/native-binary/claude (about 298 MB). The path embeds the version. Its manifest contributes no language-model provider and no public API.
  - evidence: Local --version and package.json read.
- [verified-locally] Version skew: SDK pairs with CLI 2.1.316; extension binary is 2.1.314. No obvious version-gate string in sdk.mjs (not exhaustive). Documented minimum versions (permissionPrompts none 2.1.259+, defer 2.1.246+) are met by 2.1.314.
  - evidence: String search of sdk.mjs; docs version notes.
- [inferred] The SDK spawns the CLI with --output-format stream-json --verbose --input-format stream-json and no -p or --print token in any SDK module, yet the CLI help says --input-format works only with --print. Non-interactive behavior of SDK sessions is implicit; test defer.
  - evidence: String search of sdk.mjs and core.mjs; claude --help 2.1.314.
- [verified-locally] Local CLI 2.1.314 --help lists the flags a raw stream-json route needs (input/output format, permission-prompt-tool, permission-prompts, allowedTools, disallowedTools, tools, setting-sources, bare, strict-mcp-config, resume, session-id, fork-session, json-schema, effort, model, add-dir, plugin-dir). --max-turns, which the SDK passes, is absent from the help text.
  - evidence: claude --help run locally; output saved as claude-help-2.1.314.txt.
- [verified-locally] Linux sandbox needs bubblewrap and socat (sudo apt-get install bubblewrap socat). Locally bwrap is present and a namespace probe passes; socat is missing; kernel.apparmor_restrict_unprivileged_userns=1.
  - evidence: Local probes; sandboxing page.
  - source: https://code.claude.com/docs/en/sandboxing.md
- [documented] Sandbox writes: working directory, temp directory and --add-dir paths; reads broad except denied directories; confines Bash and child processes; Read, Edit and WebFetch rules merge into the sandbox config. failIfUnavailable defaults differ between SDK JSDoc (true when enabled) and the sandboxing page (CLI runs unsandboxed); set it explicitly.
  - evidence: sandboxing page; sdk.d.ts sandbox JSDoc.
  - source: https://code.claude.com/docs/en/sandboxing.md
- [verified-locally] Lean elaboration runs arbitrary IO: lean 4.35.0 processed a file with #eval IO.FS.writeFile and wrote a file in the working directory. So Bash(lake env lean *) is code execution; lake build evaluating the lakefile is similar (inferred).
  - evidence: Probe in lean-probe/Probe.lean; output lean-probe/elaboration-side-effect.txt.
- [documented] Policy, Agent SDK overview (quoted via summarizer, re-check wording): 'Unless previously approved, Anthropic does not allow third party developers to offer claude.ai login or rate limits for their products, including agents built on the Claude Agent SDK.'
  - evidence: Overview page note.
  - source: https://code.claude.com/docs/en/agent-sdk/overview.md
- [documented] Policy, legal page (quoted via summarizer, re-check wording): OAuth is intended for subscription purchasers for ordinary use of Claude Code and native apps; developers building products should use API keys; third parties may not offer Claude.ai login or route requests through plan credentials for their users; developers may not collect, store or intermediate Claude.ai credentials; 'Nor does it prevent an end user from signing in to the unmodified Claude Code binary with their own Claude subscription'; plan limits assume ordinary, individual use of Claude Code and the Agent SDK.
  - evidence: Authentication and credential use section; usage policy text.
  - source: https://code.claude.com/docs/en/legal-and-compliance.md
- [documented] Consumer Terms section 3 (quoted via summarizer): access 'through automated or non-human means, whether through a bot, script, or otherwise' is prohibited except via an Anthropic API Key or where Anthropic explicitly permits it. Account credentials may not be shared.
  - evidence: Consumer terms text.
  - source: https://www.anthropic.com/legal/consumer-terms
- [documented] Branding: the Claude Code name and logo cannot be part of your own product name. SDK branding allows 'Claude Agent' and '{YourAgentName} Powered by Claude'.
  - evidence: Overview branding section; legal page.
  - source: https://code.claude.com/docs/en/agent-sdk/overview.md
- [documented] Current models: claude-fable-5-1 (demanding reasoning, long-horizon agentic work), claude-opus-5-5 (long-running agentic coding; start here for most workloads), claude-sonnet-5-5, claude-haiku-5-5. All have 1M context and 128K max output.
  - evidence: Models overview table.
  - source: https://platform.claude.com/docs/en/models/overview
- [documented] Aliases: opus to Opus 5.5 on the Anthropic API; fable to Fable 5.1 (provider dependent); best to fable where available, else opus; default to Opus 5.5 for Pro, Max, Team, Enterprise and API accounts unless an org default is set. Pin full model names for reproducibility.
  - evidence: Model configuration page.
  - source: https://code.claude.com/docs/en/model-config.md
- [documented] Opus 5.5 default effort is medium and it supports low, medium, high, xhigh, max. Its thinking is adaptive and always on, so thinking type 'disabled' is probably rejected (uncertain). CLAUDE_CODE_EFFORT_LEVEL has top effort precedence.
  - evidence: Models overview; model-config effort section.
  - source: https://code.claude.com/docs/en/model-config.md
- [verified-locally] SDK model controls: options.model, setModel(), fallbackModel, effort, thinking ({type:'adaptive'} | {type:'enabled', budgetTokens} | {type:'disabled'}). sdk.d.ts JSDoc examples cite older IDs (claude-sonnet-5, claude-opus-4-8, claude-fable-5); do not copy them.
  - evidence: sdk.d.ts Options JSDoc.
- [verified-locally] VS Code Language Model API (stable @types/vscode 1.144.0): lm.selectChatModels(selector?) returns Thenable<LanguageModelChat[]>; LanguageModelChat.sendRequest(messages, options, token) with options.tools and toolMode; lm.tools; lm.invokeTool; lm.registerLanguageModelChatProvider. Docs show selection and sendRequest only, say system messages are unsupported, and say Copilot models need user consent.
  - evidence: index.d.ts lines 20394 to 20954 (no proposed marker); docs page.
  - source: https://code.visualstudio.com/api/extension-guides/ai/language-model
- [inferred] No Claude provider is reachable in this VS Code: the Claude Code extension contributes no languageModelChatProviders and no Copilot or other LM provider is installed. selectChatModels would return an empty array here.
  - evidence: Extension directory listing and package.json contributes keys.
- [verified-locally] Anthropic TypeScript SDK 1.3.0 (Apache-2.0): client.beta.messages.toolRunner(params, options) returns BetaToolRunner (params: tools, max_iterations, stream, runToolsEagerly, thread). No per-turn hook option appears in these typings.
  - evidence: Tarball lib/tools/BetaToolRunner.d.ts.
  - source: https://registry.npmjs.org/@anthropic-ai/sdk/latest
- [documented] OpenAI SDK compatibility: base URL https://api.anthropic.com/v1/ with a Claude API key; tools work; strict ignored; thinking not returned; intended for testing and comparison rather than production.
  - evidence: OpenAI SDK compatibility page.
  - source: https://platform.claude.com/docs/en/cli-sdks-libraries/libraries/openai-sdk
- [verified-locally] Local environment: node and npm are not installed; socat is missing; bwrap works; lean and lake 4.35.0 installed via elan; VS Code 1.140.0 as a snap.
  - evidence: command -v checks; code --version.
- [documented] Setup: the npm CLI package requires Node.js 22+. The native installer is curl -fsSL https://claude.ai/install.sh | bash and keeps ~/.local/bin/claude as a symlink; native installs auto-update.
  - evidence: Setup page.
  - source: https://code.claude.com/docs/en/setup.md
- [documented] BASH_DEFAULT_TIMEOUT_MS defaults to 120000 (2 minutes); long lake builds may need it raised.
  - evidence: Env-vars page.
  - source: https://code.claude.com/docs/en/env-vars.md
- [verified-locally] The env option replaces the whole subprocess environment when provided; spread process.env and remove credentials yourself.
  - evidence: sdk.d.ts env JSDoc.
- [verified-locally] outputFormat {type: 'json_schema', schema} yields structured_output on the result message, useful for node and diff proposals.
  - evidence: sdk.d.ts JsonSchemaOutputFormat and SDKResultMessage.