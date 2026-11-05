// Types for telelean-path-guard.mjs (plain JS so the Claude Code CLI can run it as a hook without a build).

export declare const GUARD_POLICY_VERSION: 1;
/** Directory entries the Grep/Glob scope scan may visit before it gives up (and denies). */
export declare const DEFAULT_MAX_SCAN_ENTRIES: number;

/** The JSON object Claude Code writes to a PreToolUse hook's stdin (fields the guard uses). */
export interface HookInput {
  session_id?: string;
  transcript_path?: string;
  cwd?: string;
  permission_mode?: string;
  hook_event_name?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_use_id?: string;
  [key: string]: unknown;
}

export interface GuardPolicy {
  version: 1;
  /** Absolute path of the shadow workspace; canonicalised (realpath) on every call. */
  root: string;
  /** Path segments that are never accessible (default: .lake, .telelean, .git). */
  hiddenSegments?: string[];
  /** Refuse any path segment that starts with '.' (default true). */
  denyDotSegments?: boolean;
  /** Tool-name prefixes that pass without a decision, e.g. "mcp__telelean__". */
  passthroughToolPrefixes?: string[];
  /** Exact tool names that pass without a decision. */
  passthroughTools?: string[];
  /** What to do with a tool the guard does not know (default: deny). */
  unknownTools?: 'deny' | 'pass';
  /**
   * Grep and Glob are allowed only on a folder with no hidden entry below it; this bounds the
   * scan that checks it (default DEFAULT_MAX_SCAN_ENTRIES; a larger folder is refused).
   */
  maxScanEntries?: number;
  /** JSONL decision log (paths and patterns only, never file contents). */
  logFile?: string;
}

export interface CheckedPath {
  role: string;
  /** The path as the tool call gave it; null when the tool's default (the cwd) was used. */
  raw: string | null;
  /** The canonical (realpath) form that was checked. */
  resolved: string;
}

export interface GuardDecision {
  kind: 'pass' | 'deny';
  tool: string;
  reason: string;
  checked: CheckedPath[];
}

/** The file-system calls the guard makes (node:fs by default; tests may replace some). */
export interface GuardFs {
  realpath(p: string): string;
  lstat(p: string): { isDirectory(): boolean };
  /** Entries with lstat types (a symlink is never a directory here). */
  readdir(p: string): Array<{ name: string; isDirectory(): boolean }>;
}

export interface HookOutput {
  hookSpecificOutput: {
    hookEventName: 'PreToolUse';
    permissionDecision: 'deny';
    permissionDecisionReason: string;
  };
}

export declare function decide(input: HookInput, policy: GuardPolicy, fsImpl?: Partial<GuardFs>): GuardDecision;
export declare function hookOutputFor(decision: GuardDecision): HookOutput | undefined;
export declare function loadPolicy(policyPath: string): GuardPolicy;
/** The separate ripgrep globs Claude Code 2.1.314's Grep tool makes from its `glob` argument. */
export declare function grepGlobTokens(value: unknown): unknown[];
