// File-tool confinement for the Claude Code CLI backend (D-23, D-24, 03 §8.4 realpathGuard).
//
// The CLI's built-in file tools run outside any sandbox, so every call goes through a PreToolUse
// command hook (bin/telelean-path-guard.mjs) installed via a generated `--settings` file. The
// settings also turn on the CLI's own working-directory fences and deny rules for hidden entries
// as a second layer. Before the CLI starts, the backend runs the hook exactly as the settings
// specify on two synthetic calls (selfTestGuard), because with `onFailure: "block"` a hook that
// cannot start would block every tool call mid-run. Because `-p` silently ignores a settings file
// that fails validation, the backend then asks the running CLI for its hooks listing before the
// first prompt and refuses to start unless the guard is listed and enabled (fail closed).
//
// Grep and Glob: the hook allows them only on a folder with no hidden entry below it, since both
// tools search hidden files (see bin/telelean-path-guard.mjs). A shadow workspace whose root
// holds .lake/ or .telelean/ therefore cannot be searched as a whole, only folder by folder; a
// layout that keeps hidden material outside the agent's root avoids that (design feedback, M1).

import { spawn } from 'node:child_process';
import { accessSync, constants as fsConstants } from 'node:fs';
import { chmod, mkdir, realpath, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GUARD_POLICY_VERSION, type GuardPolicy } from '../../bin/telelean-path-guard.mjs';
import { MCP_TOOL_PREFIX } from './toolSchemas.js';

export type { GuardPolicy } from '../../bin/telelean-path-guard.mjs';

export const HIDDEN_SEGMENTS: readonly string[] = ['.lake', '.telelean', '.git'];
export const GUARD_TIMEOUT_SECONDS = 30;

/** bin/telelean-path-guard.mjs, resolved next to this module (src/llm or dist/llm). */
export function defaultGuardScriptPath(): string {
  return fileURLToPath(new URL('../../bin/telelean-path-guard.mjs', import.meta.url));
}

/** How the hook runs Node. In the VS Code extension host, process.execPath is Electron. */
export interface HookRuntime {
  command: string;
  args: string[];
}

/** A real `node` on PATH or in ~/.local/bin, if any. */
export function findNodeBinary(pathEnv = process.env.PATH ?? '', home = os.homedir()): string | undefined {
  const dirs = [...pathEnv.split(path.delimiter).filter(Boolean), path.join(home, '.local', 'bin')];
  for (const dir of dirs) {
    const candidate = path.join(dir, 'node');
    try {
      accessSync(candidate, fsConstants.X_OK);
      return candidate;
    } catch {
      // keep looking
    }
  }
  return undefined;
}

/**
 * Plain Node: this process's own binary. Inside the VS Code extension host (Electron, possibly a
 * snap whose runtime environment the hook does not inherit) a real `node` is preferred; Electron
 * in Node mode is the last resort.
 */
export function defaultHookRuntime(): HookRuntime {
  if (!process.versions.electron) return { command: process.execPath, args: [] };
  const node = findNodeBinary();
  if (node) return { command: node, args: [] };
  return { command: '/usr/bin/env', args: ['ELECTRON_RUN_AS_NODE=1', process.execPath] };
}

export interface CommandHook {
  type: 'command';
  command: string;
  args: string[];
  timeout: number;
  onFailure: 'block';
}

export interface ClaudeSettings {
  hooks: { PreToolUse: Array<{ matcher: string; hooks: CommandHook[] }> };
  /** The CLI's own fences (second layer); absent when the hook is tested alone. */
  permissions?: {
    blockReadsOutsideWorkingDirectories: true;
    blockWritesOutsideWorkingDirectories: true;
    deny: string[];
  };
}

export function buildGuardPolicy(rootReal: string, logPath: string): GuardPolicy {
  return {
    version: GUARD_POLICY_VERSION,
    root: rootReal,
    hiddenSegments: [...HIDDEN_SEGMENTS],
    denyDotSegments: true,
    passthroughToolPrefixes: [MCP_TOOL_PREFIX],
    unknownTools: 'deny',
    logFile: logPath,
  };
}

const SAFE_RULE_PATH = /^[A-Za-z0-9._/-]+$/;

/**
 * Deny rules for the CLI's own fences: the hidden directories, and every dot-entry at any depth
 * below the root, for reading and for writing (Edit rules cover every file-editing tool). The CLI
 * also applies Read deny rules to Grep and Glob: in 2.1.314 they become ripgrep `--iglob`
 * exclusions plus a result filter. `//abs/path` is the rule form of an absolute path. A root with
 * characters that the rule syntax might misread gets no rules (the hook still applies).
 */
export function cliDenyRules(rootReal: string): string[] {
  if (!SAFE_RULE_PATH.test(rootReal)) return [];
  const base = `/${rootReal}`;
  const patterns = [...HIDDEN_SEGMENTS.map((s) => `${base}/${s}/**`), `${base}/**/.*`, `${base}/**/.*/**`];
  return ['Read', 'Edit'].flatMap((tool) => patterns.map((p) => `${tool}(${p})`));
}

export function buildClaudeSettings(args: {
  runtime: HookRuntime;
  guardScriptPath: string;
  policyPath: string;
  rootReal: string;
  /** Add the CLI's own fences as a second layer (default true). */
  cliFences?: boolean;
}): ClaudeSettings {
  const deny = cliDenyRules(args.rootReal);
  const fences: Pick<ClaudeSettings, 'permissions'> =
    args.cliFences === false
      ? {}
      : { permissions: { blockReadsOutsideWorkingDirectories: true, blockWritesOutsideWorkingDirectories: true, deny } };
  return {
    ...fences,
    hooks: {
      PreToolUse: [
        {
          matcher: '*',
          hooks: [
            {
              type: 'command',
              command: args.runtime.command,
              args: [...args.runtime.args, args.guardScriptPath, args.policyPath],
              timeout: GUARD_TIMEOUT_SECONDS,
              onFailure: 'block',
            },
          ],
        },
      ],
    },
  };
}

export interface ConfinementFiles {
  rootReal: string;
  settingsPath: string;
  policyPath: string;
  logPath: string;
  guardScriptPath: string;
  settings: ClaudeSettings;
  policy: GuardPolicy;
}

export async function writeConfinementFiles(opts: {
  runDir: string;
  shadowDir: string;
  guardScriptPath?: string;
  runtime?: HookRuntime;
  cliFences?: boolean;
}): Promise<ConfinementFiles> {
  await mkdir(opts.runDir, { recursive: true, mode: 0o700 });
  const rootReal = await realpath(opts.shadowDir);
  const runReal = await realpath(opts.runDir);
  const rel = path.relative(rootReal, runReal);
  if (rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))) {
    throw new Error(`the run directory (${runReal}) must not be inside the shadow workspace (${rootReal})`);
  }
  const guardScriptPath = opts.guardScriptPath ?? defaultGuardScriptPath();
  const policyPath = path.join(runReal, 'guard-policy.json');
  const settingsPath = path.join(runReal, 'claude-settings.json');
  const logPath = path.join(runReal, 'guard-log.jsonl');
  const policy = buildGuardPolicy(rootReal, logPath);
  const settings = buildClaudeSettings({
    runtime: opts.runtime ?? defaultHookRuntime(),
    guardScriptPath,
    policyPath,
    rootReal,
    cliFences: opts.cliFences ?? true,
  });
  await writeFile(policyPath, `${JSON.stringify(policy, null, 2)}\n`, { mode: 0o600 });
  await writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
  await writeFile(logPath, '', { mode: 0o600, flag: 'a' });
  await chmod(logPath, 0o600);
  return { rootReal, settingsPath, policyPath, logPath, guardScriptPath, settings, policy };
}

export interface GuardProbeResult {
  name: 'outside' | 'inside';
  filePath: string;
  expected: 'deny' | 'pass';
  /** What the hook did: printed a deny, printed nothing, or failed (spawn error, exit != 0, bad output, timeout). */
  outcome: 'deny' | 'pass' | 'error';
  exitCode: number | null;
  signal: string | null;
  detail?: string;
}

export interface GuardSelfTest {
  ok: boolean;
  problems: string[];
  probes: GuardProbeResult[];
  durationMs: number;
}

/** File name (inside the shadow, never created) that the self-test's "inside" probe asks about. */
export const GUARD_SELFTEST_FILE = 'telelean-guard-selftest.lean';
/** session_id the self-test puts into its synthetic hook inputs (also in the guard log). */
export const GUARD_SELFTEST_SESSION = 'telelean-guard-selftest';

/**
 * Runs the PreToolUse hook exactly as the generated settings tell the CLI to (same command, args,
 * environment and working directory) on two synthetic Read calls: one outside the workspace (the
 * policy file, which must be denied) and one inside it (a new file name, which must pass). With
 * `onFailure: "block"`, a hook runtime that cannot start would otherwise block every tool call
 * after the first prompt had already spent quota. Nothing is created; the guard logs both probes
 * under session_id GUARD_SELFTEST_SESSION.
 */
export async function selfTestGuard(
  files: Pick<ConfinementFiles, 'settings' | 'rootReal' | 'policyPath'>,
  opts: { env: Record<string, string>; timeoutMs?: number },
): Promise<GuardSelfTest> {
  const started = Date.now();
  const hook = files.settings.hooks.PreToolUse[0]?.hooks[0];
  if (!hook) {
    return { ok: false, problems: ['the generated settings contain no PreToolUse hook'], probes: [], durationMs: 0 };
  }
  const timeoutMs = opts.timeoutMs ?? GUARD_TIMEOUT_SECONDS * 1000;
  const probes: GuardProbeResult[] = [];
  const cases: Array<Pick<GuardProbeResult, 'name' | 'filePath' | 'expected'>> = [
    { name: 'outside', filePath: files.policyPath, expected: 'deny' },
    { name: 'inside', filePath: path.join(files.rootReal, GUARD_SELFTEST_FILE), expected: 'pass' },
  ];
  for (const c of cases) {
    const input = {
      session_id: GUARD_SELFTEST_SESSION,
      cwd: files.rootReal,
      permission_mode: 'dontAsk',
      hook_event_name: 'PreToolUse',
      tool_name: 'Read',
      tool_input: { file_path: c.filePath },
      tool_use_id: `${GUARD_SELFTEST_SESSION}-${c.name}`,
    };
    probes.push({ ...c, ...(await runHookOnce(hook, input, { cwd: files.rootReal, env: opts.env, timeoutMs })) });
  }
  const problems = probes
    .filter((p) => p.outcome !== p.expected)
    .map((p) => `the ${p.name} probe (${p.filePath}) should ${p.expected === 'deny' ? 'be denied' : 'pass'} but the hook ${p.outcome === 'error' ? `failed: ${p.detail ?? 'unknown error'}` : p.outcome === 'deny' ? 'denied it' : 'let it pass'}`);
  return { ok: problems.length === 0, problems, probes, durationMs: Date.now() - started };
}

function runHookOnce(
  hook: CommandHook,
  input: unknown,
  opts: { cwd: string; env: Record<string, string>; timeoutMs: number },
): Promise<Omit<GuardProbeResult, 'name' | 'filePath' | 'expected'>> {
  return new Promise((resolve) => {
    let settled = false;
    let stdout = '';
    let stderr = '';
    let timer: NodeJS.Timeout | undefined;
    const finish = (r: Omit<GuardProbeResult, 'name' | 'filePath' | 'expected'>): void => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(r);
    };
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(hook.command, hook.args, { cwd: opts.cwd, env: opts.env, stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (err) {
      finish({ outcome: 'error', exitCode: null, signal: null, detail: `cannot start ${hook.command}: ${(err as Error).message}` });
      return;
    }
    timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish({ outcome: 'error', exitCode: null, signal: 'SIGKILL', detail: `no answer within ${opts.timeoutMs} ms` });
    }, opts.timeoutMs);
    timer.unref();
    child.stdout?.setEncoding('utf8').on('data', (d: string) => (stdout += d));
    child.stderr?.setEncoding('utf8').on('data', (d: string) => (stderr += d));
    child.stdin?.on('error', () => {}); // EPIPE when the command exits without reading
    child.on('error', (err) => finish({ outcome: 'error', exitCode: null, signal: null, detail: `cannot start ${hook.command}: ${err.message}` }));
    child.on('close', (code, signal) => {
      const base = { exitCode: code, signal };
      if (code !== 0) {
        const msg = stderr.trim().slice(-500);
        return finish({ ...base, outcome: 'error', detail: `exit ${String(code)}${signal ? ` (${signal})` : ''}${msg ? `: ${msg}` : ''}` });
      }
      if (stdout.trim() === '') return finish({ ...base, outcome: 'pass' });
      try {
        const parsed = JSON.parse(stdout) as { hookSpecificOutput?: { permissionDecision?: unknown } };
        if (parsed.hookSpecificOutput?.permissionDecision === 'deny') return finish({ ...base, outcome: 'deny' });
        return finish({ ...base, outcome: 'error', detail: `unexpected output: ${stdout.trim().slice(0, 300)}` });
      } catch {
        return finish({ ...base, outcome: 'error', detail: `output is not JSON: ${stdout.trim().slice(0, 300)}` });
      }
    });
    child.stdin?.end(JSON.stringify(input));
  });
}

export interface HookVerification {
  ok: boolean;
  problems: string[];
  matchedRow?: Record<string, unknown>;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Checks the CLI's `get_hooks_listing` control response: hooks must not be disabled by policy and
 * the guard must be listed for PreToolUse on every tool, enabled.
 */
export function verifyHooksListing(
  listing: unknown,
  expected: { guardScriptPath: string; policyPath: string },
): HookVerification {
  const problems: string[] = [];
  if (!isRecord(listing)) return { ok: false, problems: ['the hooks listing is not an object'] };
  const policy = listing.policy;
  if (isRecord(policy)) {
    for (const key of ['disabledByPolicy', 'managedOnly', 'pluginOnly', 'allDisabled']) {
      if (policy[key] === true) problems.push(`hooks are switched off (${key})`);
    }
  }
  const rows = Array.isArray(listing.hooks) ? listing.hooks.filter(isRecord) : [];
  const row = rows.find((r) => {
    if (r.event !== 'PreToolUse') return false;
    const text = JSON.stringify(r);
    return text.includes(expected.guardScriptPath) && text.includes(expected.policyPath);
  });
  if (!row) {
    problems.push('the telelean PreToolUse guard is not among the hooks the CLI loaded');
  } else {
    if (row.disabled === true) problems.push('the telelean PreToolUse guard is listed but disabled');
    if (typeof row.matcher === 'string' && row.matcher !== '*' && row.matcher !== '') {
      problems.push(`the telelean guard has matcher '${row.matcher}', expected '*'`);
    }
  }
  return { ok: problems.length === 0, problems, ...(row ? { matchedRow: row } : {}) };
}
