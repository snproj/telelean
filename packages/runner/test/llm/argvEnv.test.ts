import { describe, expect, it } from 'vitest';
import {
  BUILTIN_TOOLS,
  buildClaudeArgs,
  classifyAuth,
  type ClaudeArgsInput,
} from '../../src/llm/claudeCli.js';
import { buildClaudeSettings, cliDenyRules, verifyHooksListing } from '../../src/llm/confinement.js';
import { sanitizeClaudeEnv } from '../../src/llm/env.js';

const base: ClaudeArgsInput = {
  model: 'claude-haiku-5-5',
  systemPromptFile: '/run/system-prompt.md',
  settingsFile: '/run/claude-settings.json',
  mcpConfigFile: '/run/mcp-config.json',
  sessionId: '11111111-2222-4333-8444-555555555555',
  restricted: true,
  includePartialMessages: false,
  includeHookEvents: true,
  permissionPromptsNone: true,
  maxTurns: 6,
};

/** Value following a flag. */
const flag = (args: string[], name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

describe('buildClaudeArgs', () => {
  it('assembles the headless stream-json invocation with the confinement flags', () => {
    const args = buildClaudeArgs(base);
    expect(args.slice(0, 6)).toEqual(['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose']);
    expect(flag(args, '--model')).toBe('claude-haiku-5-5');
    expect(flag(args, '--tools')).toBe('Read,Glob,Grep,Edit,Write');
    expect(flag(args, '--allowedTools')).toBe('Read,Glob,Grep,Edit,Write,mcp__telelean__*');
    expect(flag(args, '--disallowedTools')).toBe('Bash,WebFetch,WebSearch,Agent,AskUserQuestion,NotebookEdit');
    expect(flag(args, '--permission-mode')).toBe('dontAsk');
    expect(flag(args, '--permission-prompts')).toBe('none');
    expect(args).toContain('--setting-sources=');
    expect(flag(args, '--settings')).toBe('/run/claude-settings.json');
    expect(flag(args, '--mcp-config')).toBe('/run/mcp-config.json');
    expect(args).toContain('--strict-mcp-config');
    expect(args).toContain('--restricted');
    expect(args).toContain('--include-hook-events');
    expect(flag(args, '--system-prompt-file')).toBe('/run/system-prompt.md');
    expect(flag(args, '--max-turns')).toBe('6');
    expect(flag(args, '--session-id')).toBe(base.sessionId);
    expect(args).not.toContain('--resume');
  });

  it('never uses --bare, which ignores the subscription login', () => {
    expect(buildClaudeArgs(base)).not.toContain('--bare');
    expect(buildClaudeArgs({ ...base, restricted: false, permissionPromptsNone: false })).not.toContain('--bare');
  });

  it('every variadic flag gets one comma-joined value, so it cannot swallow later flags', () => {
    const args = buildClaudeArgs(base);
    for (const f of ['--tools', '--allowedTools', '--disallowedTools', '--mcp-config']) {
      const i = args.indexOf(f);
      expect(args[i + 2]?.startsWith('-'), `${f} followed by a flag`).toBe(true);
    }
  });

  it('resumes by id instead of fixing a new session id', () => {
    const args = buildClaudeArgs({ ...base, resumeSessionId: 'abc-session' });
    expect(flag(args, '--resume')).toBe('abc-session');
    expect(args).not.toContain('--session-id');
  });

  it('adds optional model controls only when asked', () => {
    const args = buildClaudeArgs({ ...base, effort: 'high', thinking: 'disabled', maxBudgetUsd: 0.5, includePartialMessages: true });
    expect(flag(args, '--effort')).toBe('high');
    expect(flag(args, '--thinking')).toBe('disabled');
    expect(flag(args, '--max-budget-usd')).toBe('0.5');
    expect(args).toContain('--include-partial-messages');
    const plain = buildClaudeArgs({ ...base, maxTurns: undefined });
    expect(plain).not.toContain('--effort');
    expect(plain).not.toContain('--thinking');
    expect(plain).not.toContain('--max-turns');
  });

  it('lists exactly the file tools the guard knows about', () => {
    expect([...BUILTIN_TOOLS]).toEqual(['Read', 'Glob', 'Grep', 'Edit', 'Write']);
  });
});

describe('sanitizeClaudeEnv', () => {
  const host = {
    PATH: '/usr/bin',
    HOME: '/home/u',
    LANG: 'en_GB.UTF-8',
    HTTPS_PROXY: 'http://proxy:3128',
    ANTHROPIC_API_KEY: 'sk-secret',
    ANTHROPIC_AUTH_TOKEN: 'tok',
    ANTHROPIC_BASE_URL: 'https://gateway.example',
    ANTHROPIC_MODEL: 'x',
    CLAUDE_CODE_OAUTH_TOKEN: 'oauth',
    CLAUDE_CODE_USE_BEDROCK: '1',
    CLAUDE_CODE_USE_VERTEX: '1',
    CLAUDE_CODE_USE_FOUNDRY: '1',
    AWS_BEARER_TOKEN_BEDROCK: 'b',
    CLAUDECODE: '1',
    CLAUDE_CODE_SESSION_ID: 'parent',
    CLAUDE_CODE_MESSAGING_SOCKET: '/tmp/sock',
    CLAUDE_CODE_ENTRYPOINT: 'claude-vscode',
    CLAUDE_CONFIG_DIR: '/home/u/.claude-alt',
    MCP_CONNECTION_NONBLOCKING: 'true',
    DISABLE_PROMPT_CACHING: '1',
    DISABLE_TELEMETRY: '1',
    ELECTRON_RUN_AS_NODE: '1',
    VSCODE_IPC_HOOK: '/run/vscode.sock',
    SNAP: '/snap/code/1',
    SNAP_NAME: 'code',
    GTK_PATH: '/snap/gtk',
    GDK_BACKEND: 'x11',
    GIO_MODULE_DIR: '/snap/gio',
    LOCPATH: '/snap/locale',
    NODE_OPTIONS: '--require evil.js',
    SSH_AUTH_SOCK: '/run/ssh',
    XDG_DATA_DIRS: '/snap/code/usr/share',
    XDG_DATA_DIRS_VSCODE_SNAP_ORIG: '/usr/local/share:/usr/share',
    XDG_CONFIG_DIRS_VSCODE_SNAP_ORIG: '',
    XDG_CONFIG_DIRS: '/snap/etc/xdg',
    CCR_OAUTH_TOKEN_FILE: '/run/ccr-token',
    CCR_AGENT_PROXY_ENABLED: '1',
    AGENT_PROXY_URL: 'http://proxy.internal',
    AGENT_PROXY_AUTH_TOKEN: 'proxy-secret',
    CLAUDE_CODE_GLOB_HIDDEN: 'true',
    UNDEFINED_ONE: undefined,
  };

  it('removes every billing, provider and parent-session variable', () => {
    const { env, removed } = sanitizeClaudeEnv(host);
    for (const name of [
      'ANTHROPIC_API_KEY',
      'ANTHROPIC_AUTH_TOKEN',
      'ANTHROPIC_BASE_URL',
      'ANTHROPIC_MODEL',
      'CLAUDE_CODE_OAUTH_TOKEN',
      'CLAUDE_CODE_USE_BEDROCK',
      'CLAUDE_CODE_USE_VERTEX',
      'CLAUDE_CODE_USE_FOUNDRY',
      'AWS_BEARER_TOKEN_BEDROCK',
      'CLAUDECODE',
      'CLAUDE_CODE_SESSION_ID',
      'CLAUDE_CODE_MESSAGING_SOCKET',
      'CLAUDE_CODE_ENTRYPOINT',
      'MCP_CONNECTION_NONBLOCKING',
      'DISABLE_PROMPT_CACHING',
      'CCR_OAUTH_TOKEN_FILE',
      'CCR_AGENT_PROXY_ENABLED',
      'AGENT_PROXY_URL',
      'AGENT_PROXY_AUTH_TOKEN',
    ]) {
      expect(env[name], name).toBeUndefined();
      expect(removed).toContain(name);
    }
  });

  it('removes host-injected snap, Electron and VS Code variables', () => {
    const { env } = sanitizeClaudeEnv(host);
    for (const name of ['ELECTRON_RUN_AS_NODE', 'VSCODE_IPC_HOOK', 'SNAP', 'SNAP_NAME', 'GTK_PATH', 'GDK_BACKEND', 'GIO_MODULE_DIR', 'LOCPATH', 'NODE_OPTIONS', 'SSH_AUTH_SOCK']) {
      expect(env[name], name).toBeUndefined();
    }
  });

  it('restores XDG lists from the snap originals', () => {
    const { env, restored } = sanitizeClaudeEnv(host);
    expect(env.XDG_DATA_DIRS).toBe('/usr/local/share:/usr/share');
    expect(env.XDG_CONFIG_DIRS).toBeUndefined();
    expect(env.XDG_DATA_DIRS_VSCODE_SNAP_ORIG).toBeUndefined();
    expect(restored.sort()).toEqual(['XDG_CONFIG_DIRS', 'XDG_DATA_DIRS']);
  });

  it('keeps ordinary variables, the login location and privacy switches', () => {
    const { env } = sanitizeClaudeEnv(host);
    expect(env.PATH).toBe('/usr/bin');
    expect(env.HOME).toBe('/home/u');
    expect(env.HTTPS_PROXY).toBe('http://proxy:3128');
    expect(env.CLAUDE_CONFIG_DIR).toBe('/home/u/.claude-alt');
    expect(env.DISABLE_TELEMETRY).toBe('1');
    expect('UNDEFINED_ONE' in env).toBe(false);
    // Fixer round 1: Claude Code's single switch for non-essential traffic (telemetry, error reports) is the user's too.
    const privacy = sanitizeClaudeEnv({ CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1', DISABLE_ERROR_REPORTING: '1', CLAUDE_CODE_OAUTH_TOKEN: 'x' });
    expect(privacy.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC).toBe('1');
    expect(privacy.env.DISABLE_ERROR_REPORTING).toBe('1');
    expect(privacy.env.CLAUDE_CODE_OAUTH_TOKEN).toBeUndefined();
  });

  it("sets telelean's switches, and lets callers override them", () => {
    const { env, set } = sanitizeClaudeEnv(host, { set: { MCP_TOOL_TIMEOUT: '1000' }, clientApp: 'telelean/test' });
    expect(env.CLAUDE_CODE_DISABLE_AUTO_MEMORY).toBe('1');
    expect(env.ENABLE_CLAUDEAI_MCP_SERVERS).toBe('false');
    expect(env.ENABLE_TOOL_SEARCH).toBe('false');
    expect(env.CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS).toBe('0');
    expect(env.CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT).toBe('0');
    expect(env.CLAUDE_CODE_GLOB_HIDDEN).toBe('false'); // the host's 'true' is replaced
    expect(env.CLAUDE_AGENT_SDK_CLIENT_APP).toBe('telelean/test');
    expect(env.MCP_TOOL_TIMEOUT).toBe('1000');
    expect(set.MCP_TOOL_TIMEOUT).toBe('1000');
  });

  it('reports names only, never values', () => {
    const report = JSON.stringify(sanitizeClaudeEnv(host).removed);
    expect(report).not.toContain('sk-secret');
    expect(report).not.toContain('oauth');
  });
});

describe('confinement settings and hook verification', () => {
  const settings = buildClaudeSettings({
    runtime: { command: '/usr/bin/node', args: [] },
    guardScriptPath: '/repo/bin/telelean-path-guard.mjs',
    policyPath: '/run/guard-policy.json',
    rootReal: '/home/u/ws',
  });

  it('installs the guard as an exec-form PreToolUse hook on every tool that blocks on failure', () => {
    const entry = settings.hooks.PreToolUse[0];
    expect(entry?.matcher).toBe('*');
    expect(entry?.hooks[0]).toEqual({
      type: 'command',
      command: '/usr/bin/node',
      args: ['/repo/bin/telelean-path-guard.mjs', '/run/guard-policy.json'],
      timeout: 30,
      onFailure: 'block',
    });
  });

  it("adds the CLI's own fences and Read/Edit deny rules for every hidden entry", () => {
    expect(settings.permissions?.blockReadsOutsideWorkingDirectories).toBe(true);
    expect(settings.permissions?.blockWritesOutsideWorkingDirectories).toBe(true);
    const deny = settings.permissions?.deny ?? [];
    expect(deny).toContain('Read(//home/u/ws/.lake/**)');
    expect(deny).toContain('Read(//home/u/ws/.telelean/**)');
    // Dot-entries at any depth; the CLI also turns Read deny rules into Grep/Glob exclusions.
    expect(deny).toContain('Read(//home/u/ws/**/.*)');
    expect(deny).toContain('Read(//home/u/ws/**/.*/**)');
    expect(deny).toContain('Edit(//home/u/ws/**/.*)');
    expect(deny).toContain('Edit(//home/u/ws/.lake/**)');
    expect(deny).toEqual(cliDenyRules('/home/u/ws'));
    expect(deny).toHaveLength(10);
    const odd = buildClaudeSettings({ runtime: { command: 'n', args: [] }, guardScriptPath: 'g', policyPath: 'p', rootReal: '/home/u/my (ws)' });
    expect(odd.permissions?.deny).toEqual([]);
  });

  it('leaves the fences out when the hook is tested alone, keeping the hook', () => {
    const hookOnly = buildClaudeSettings({ runtime: { command: 'n', args: [] }, guardScriptPath: 'g', policyPath: 'p', rootReal: '/ws', cliFences: false });
    expect(hookOnly.permissions).toBeUndefined();
    expect(hookOnly.hooks.PreToolUse[0]?.hooks[0]?.onFailure).toBe('block');
  });

  const expected = { guardScriptPath: '/repo/bin/telelean-path-guard.mjs', policyPath: '/run/guard-policy.json' };
  const row = {
    event: 'PreToolUse',
    matcher: '*',
    source: 'flagSettings',
    type: 'command',
    commandText: '/usr/bin/node /repo/bin/telelean-path-guard.mjs /run/guard-policy.json',
  };

  it('accepts a listing that shows the guard', () => {
    const v = verifyHooksListing({ hooks: [row], policy: { disabledByPolicy: false, managedOnly: false, allDisabled: false } }, expected);
    expect(v).toMatchObject({ ok: true, problems: [] });
  });

  it('refuses listings without the guard, with it disabled, or with hooks switched off', () => {
    expect(verifyHooksListing({ hooks: [] }, expected).ok).toBe(false);
    expect(verifyHooksListing({ hooks: [{ ...row, event: 'PostToolUse' }] }, expected).ok).toBe(false);
    expect(verifyHooksListing({ hooks: [{ ...row, disabled: true }] }, expected).problems.join()).toMatch(/disabled/);
    expect(verifyHooksListing({ hooks: [{ ...row, matcher: 'Read' }] }, expected).ok).toBe(false);
    expect(verifyHooksListing({ hooks: [row], policy: { allDisabled: true } }, expected).problems.join()).toMatch(/allDisabled/);
    expect(verifyHooksListing({ hooks: [row], policy: { managedOnly: true } }, expected).ok).toBe(false);
    expect(verifyHooksListing(null, expected).ok).toBe(false);
  });
});

describe('classifyAuth', () => {
  it('recognises a claude.ai subscription login (2.1.314 account shape)', () => {
    const a = classifyAuth({ apiProvider: 'firstParty', subscriptionType: 'max', email: 'x@example.com' });
    expect(a.verdict).toBe('subscription');
    expect(a.hasEmail).toBe(true);
    expect(JSON.stringify(a)).not.toContain('example.com');
  });

  it('refuses API keys, third-party providers, env tokens and unknown shapes', () => {
    expect(classifyAuth({ apiProvider: 'firstParty', apiKeySource: 'ANTHROPIC_API_KEY' }).verdict).toBe('api-key');
    expect(classifyAuth({ apiProvider: 'firstParty', subscriptionType: 'max', apiKeySource: '/login managed key' }).verdict).toBe('api-key');
    expect(classifyAuth({ apiProvider: 'bedrock' }).verdict).toBe('third-party');
    expect(classifyAuth({ apiProvider: 'firstParty', tokenSource: 'CLAUDE_CODE_OAUTH_TOKEN' }).verdict).toBe('oauth-token');
    expect(classifyAuth({ apiProvider: 'firstParty', tokenSource: 'apiKeyHelper' }).verdict).toBe('unknown');
    expect(classifyAuth({ apiProvider: 'firstParty' }).verdict).toBe('unknown');
    expect(classifyAuth(undefined).verdict).toBe('unknown');
    expect(classifyAuth({ apiProvider: 'firstParty', subscriptionType: 'pro' }, 'ANTHROPIC_API_KEY').verdict).toBe('api-key');
  });
});
