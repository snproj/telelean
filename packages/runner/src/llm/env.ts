// Environment for the Claude Code CLI process (D-23 safeguards, 03 §8.2).
//
// Goals:
//  - never bill per token by accident: every API-key, auth-token, gateway and cloud-provider
//    variable is removed, so the CLI can only use the user's own claude.ai login;
//  - never attach to another Claude Code session: variables that a parent Claude Code process
//    exports (CLAUDECODE, CLAUDE_CODE_SESSION_ID, CLAUDE_CODE_MESSAGING_SOCKET, …) are removed;
//  - remove what a snap-packaged VS Code / Electron host injects (SNAP*, GTK_*, ELECTRON_*, …);
//  - set telelean's own switches (no auto memory, no claude.ai connectors, no tool search, no
//    automatic backgrounding, long tool-call timeouts for ask_user).
// Only variable NAMES are ever reported; values may be secrets.

import path from 'node:path';

/** Removed when the name starts with one of these. */
export const STRIP_PREFIXES: readonly string[] = [
  'ANTHROPIC_', // API keys, auth tokens, base URLs, Bedrock/Vertex/Foundry/AWS/Google settings, models
  'CLAUDE', // CLAUDECODE, CLAUDE_CODE_* (provider switches, OAuth tokens, parent-session links), CLAUDE_*
  'MCP_', // MCP timeouts and behaviour: telelean sets its own
  'ENABLE_', // ENABLE_TOOL_SEARCH, ENABLE_CLAUDEAI_MCP_SERVERS, ENABLE_IDE_INTEGRATION, …
  'DISABLE_', // DISABLE_PROMPT_CACHING and friends change cost; telelean sets its own
  'AWS_BEARER_TOKEN_', // Bedrock API keys
  'VERTEX_REGION_', // Vertex routing
  'CCR_', // Claude Code cloud-runner settings (agent proxy, OAuth token files); never wanted locally
  'AGENT_PROXY_', // AGENT_PROXY_URL / AGENT_PROXY_AUTH_TOKEN of the cloud runner
  'OTEL_', // telemetry exporters configured for the user's own sessions
  'BUN_', // runtime options of the Bun-built binary
  'ELECTRON_', // ELECTRON_RUN_AS_NODE from the VS Code extension host
  'VSCODE_', // VS Code IPC handles
  'SNAP', // snap-packaged VS Code
  'GTK_',
  'GDK_',
  'GIO_',
  // 2k2 (D2-113): GIT_DIR, GIT_WORK_TREE and the like from the host would point git anywhere; telelean sets its own
  // GIT_CEILING_DIRECTORIES (gitCeilingEnv).
  'GIT_',
];

/** Removed by exact name. */
export const STRIP_EXACT: readonly string[] = [
  'NODE_OPTIONS',
  'LOCPATH',
  'GSETTINGS_SCHEMA_DIR',
  'SSH_AUTH_SOCK',
  'GOOGLE_APPLICATION_CREDENTIALS',
  'CLOUD_ML_REGION',
  'MAX_THINKING_TOKENS',
  'MAX_MCP_OUTPUT_TOKENS',
];

/** Kept even though a strip rule matches them. */
export const KEEP: readonly string[] = [
  'CLAUDE_CONFIG_DIR', // where the user's login lives, if they moved it
  'DISABLE_TELEMETRY', // the user's privacy choices
  'DISABLE_ERROR_REPORTING',
  'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC', // the user's single switch for all of the above (and other non-essential traffic)
];

/**
 * 2k2 (docs/slice2-plan.md 2.10, D2-113): ws/ now lies inside the model folder, and so inside the model's git repository.
 * With the run folder (ws/'s parent) as the ceiling, git started in ws/ or below looks at ws/ alone (which never holds a
 * `.git`) and never at the run folder or above: it finds no repository. `wsReal` is ws/'s real path.
 *
 * The ceiling is a ':'-separated list, so a run folder whose path holds a ':' cannot be one entry; then `GIT_DIR` names a
 * directory that does not exist in the run folder instead, so git searches nowhere and finds no repository either.
 */
export function gitCeilingEnv(wsReal: string): Record<string, string> {
  const runDir = path.dirname(wsReal);
  return runDir.includes(':') ? { GIT_DIR: path.join(runDir, 'no-git-repository') } : { GIT_CEILING_DIRECTORIES: runDir };
}

/** One day: ask_user may wait for a long time (the CLI default idle timeout for HTTP servers is 5 min). */
export const TOOL_CALL_TIMEOUT_MS = 24 * 60 * 60 * 1000;

/** Variables telelean sets for every CLI process. */
export function teleleanClaudeEnv(clientApp = 'telelean/0.0.0'): Record<string, string> {
  return {
    CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1',
    CLAUDE_CODE_DISABLE_CLAUDE_MDS: '1',
    ENABLE_CLAUDEAI_MCP_SERVERS: 'false',
    // Keep the telelean tools in the prompt (no ToolSearch step; ToolSearch is not in our tool list).
    ENABLE_TOOL_SEARCH: 'false',
    // A long ask_user call must block, never move to a background task.
    CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS: '0',
    CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: '1',
    // Tool-call limits (the per-server `timeout` in the MCP config sets the same values).
    MCP_TOOL_TIMEOUT: String(TOOL_CALL_TIMEOUT_MS),
    CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT: '0',
    // Glob stops passing --hidden to ripgrep, so hidden files are not listed by ordinary patterns
    // such as **/*.lean. Only an extra layer: a whitelist pattern like **/* still matches dot-names
    // (verified with ripgrep 15.0.0), and Grep always passes --hidden. The path guard is what keeps
    // Grep and Glob out of folders with hidden entries.
    CLAUDE_CODE_GLOB_HIDDEN: 'false',
    // Skips the small-model request that titles the session; no terminal to update anyway.
    CLAUDE_CODE_DISABLE_TERMINAL_TITLE: '1',
    DISABLE_AUTOUPDATER: '1',
    CLAUDE_AGENT_SDK_CLIENT_APP: clientApp,
  };
}

export interface SanitizeOptions {
  /** Extra variables to set after stripping (they win over telelean's defaults). */
  set?: Record<string, string>;
  /** Extra names to keep. */
  keep?: string[];
  /** Client-app identifier sent in the CLI's user agent. */
  clientApp?: string;
}

export interface SanitizedEnv {
  env: Record<string, string>;
  /** Names removed from the base environment (values are never reported). */
  removed: string[];
  /** Variables telelean set, with values (these never contain secrets). */
  set: Record<string, string>;
  /** Names restored from a snap host's *_VSCODE_SNAP_ORIG copies. */
  restored: string[];
}

export function shouldStrip(name: string, keep: ReadonlySet<string>): boolean {
  if (keep.has(name)) return false;
  if (STRIP_EXACT.includes(name)) return true;
  return STRIP_PREFIXES.some((p) => name.startsWith(p));
}

export function sanitizeClaudeEnv(
  base: Readonly<Record<string, string | undefined>>,
  opts: SanitizeOptions = {},
): SanitizedEnv {
  const keep = new Set([...KEEP, ...(opts.keep ?? [])]);
  const env: Record<string, string> = {};
  const removed: string[] = [];
  const restored: string[] = [];

  for (const [name, value] of Object.entries(base)) {
    if (value === undefined) continue;
    if (name.endsWith('_VSCODE_SNAP_ORIG')) {
      removed.push(name);
      continue;
    }
    if (shouldStrip(name, keep)) {
      removed.push(name);
      continue;
    }
    env[name] = value;
  }

  // A snap-packaged VS Code rewrites XDG_* lists and keeps the originals in *_VSCODE_SNAP_ORIG.
  for (const name of ['XDG_DATA_DIRS', 'XDG_CONFIG_DIRS']) {
    const orig = base[`${name}_VSCODE_SNAP_ORIG`];
    if (orig === undefined) continue;
    if (orig === '') delete env[name];
    else env[name] = orig;
    restored.push(name);
  }

  const set = { ...teleleanClaudeEnv(opts.clientApp), ...(opts.set ?? {}) };
  Object.assign(env, set);
  return { env, removed: removed.sort(), set, restored };
}
