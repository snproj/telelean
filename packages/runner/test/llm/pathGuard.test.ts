import { spawnSync } from 'node:child_process';
import { mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { decide, grepGlobTokens, hookOutputFor, type GuardPolicy, type HookInput } from '../../bin/telelean-path-guard.mjs';
import { buildClaudeSettings, buildGuardPolicy, defaultGuardScriptPath, selfTestGuard } from '../../src/llm/confinement.js';
import { makeCleanShadow, makeShadow, removeDir, type ShadowFixture } from './helpers.js';

let fx: ShadowFixture;
let clean: ShadowFixture;
let policy: GuardPolicy;
let cleanPolicy: GuardPolicy;

beforeAll(async () => {
  fx = await makeShadow();
  clean = await makeCleanShadow();
  policy = buildGuardPolicy(fx.root, path.join(fx.runDir, 'guard-log.jsonl'));
  cleanPolicy = buildGuardPolicy(clean.root, path.join(clean.runDir, 'guard-log.jsonl'));
});
afterAll(async () => {
  await removeDir(fx.base);
  await removeDir(clean.base);
});

function call(tool: string, toolInput: Record<string, unknown>, extra: Partial<HookInput> = {}) {
  return decide({ hook_event_name: 'PreToolUse', tool_name: tool, tool_input: toolInput, cwd: fx.root, ...extra }, policy);
}
/** The same call in the workspace without hidden entries. */
function callClean(tool: string, toolInput: Record<string, unknown>, pol: GuardPolicy = cleanPolicy) {
  return decide({ hook_event_name: 'PreToolUse', tool_name: tool, tool_input: toolInput, cwd: clean.root }, pol);
}
const p = (...parts: string[]) => path.join(fx.root, ...parts);

describe('path guard: file tools', () => {
  it('allows model files inside the shadow, by absolute and relative path', () => {
    expect(call('Read', { file_path: p('Model.lean') }).kind).toBe('pass');
    expect(call('Read', { file_path: 'Model/Spyro/Main.lean' }).kind).toBe('pass');
    expect(call('Edit', { file_path: p('Model.lean'), old_string: 'a', new_string: 'b' }).kind).toBe('pass');
  });

  it('allows new files, resolving through the deepest existing parent', () => {
    expect(call('Write', { file_path: p('New.lean'), content: 'x' }).kind).toBe('pass');
    const nested = call('Write', { file_path: p('NewDir', 'Sub', 'New.lean'), content: 'x' });
    expect(nested.kind).toBe('pass');
    expect(nested.checked[0]?.resolved).toBe(path.join(fx.root, 'NewDir', 'Sub', 'New.lean'));
  });

  it('denies paths outside the shadow', () => {
    const d = call('Read', { file_path: '/etc/hostname' });
    expect(d.kind).toBe('deny');
    expect(d.reason).toMatch(/resolves outside the workspace copy/);
    expect(call('Read', { file_path: path.join(os.homedir(), '.bashrc') }).kind).toBe('deny');
  });

  it('denies ~ paths and .. segments even when they would land inside', () => {
    expect(call('Read', { file_path: '~/.bashrc' }).reason).toMatch(/'~'/);
    expect(call('Read', { file_path: `${fx.root}/../outside/secret.txt` }).reason).toMatch(/'\.\.'/);
    expect(call('Read', { file_path: `${fx.root}/Model/../Model.lean` }).kind).toBe('deny');
  });

  it('denies a symlink inside the shadow that points outside (file and directory)', () => {
    const viaDir = call('Read', { file_path: p('escape', 'secret.txt') });
    expect(viaDir.kind).toBe('deny');
    expect(viaDir.reason).toContain(path.join(fx.outside, 'secret.txt'));
    expect(call('Read', { file_path: p('escape-file') }).kind).toBe('deny');
    expect(call('Write', { file_path: p('escape', 'new.txt'), content: 'x' }).kind).toBe('deny');
  });

  it('denies writing through a dangling symlink', () => {
    expect(call('Write', { file_path: p('dangling'), content: 'x' }).reason).toMatch(/dangling symlink/);
  });

  it('denies hidden entries, by name and by symlink target', () => {
    for (const rel of ['.lake/build/x.olean', '.telelean/decisions.json', '.git/config']) {
      expect(call('Read', { file_path: p(...rel.split('/')) }).kind, rel).toBe('deny');
    }
    expect(call('Read', { file_path: p('innocent-link') }).reason).toMatch(/hidden entry \('\.lake'\)/);
    expect(call('Read', { file_path: p('.hidden-link') }).reason).toMatch(/hidden entry/);
    expect(call('Write', { file_path: p('.env'), content: 'x' }).kind).toBe('deny');
  });

  it('denies malformed inputs', () => {
    expect(call('Read', {}).reason).toMatch(/needs a "file_path"/);
    expect(call('Read', { file_path: 42 }).kind).toBe('deny');
    expect(call('Read', { file_path: `${p('Model.lean')}\0x` }).reason).toMatch(/NUL/);
  });
});

describe('path guard: Glob and Grep search scope', () => {
  // Claude Code 2.1.314's Grep runs ripgrep with --hidden and its Glob runs `rg --files --hidden
  // --no-ignore`, and a whitelist glob like **/* matches dot-names, so a search over a folder that
  // contains hidden entries would reach them whatever the pattern says (reproduced by the
  // verifier with the real hook and ripgrep).
  it('denies Grep and Glob over a folder that contains hidden entries, suggesting folders without them', () => {
    const grep = call('Grep', { pattern: 'SECRET' });
    expect(grep.kind).toBe('deny');
    expect(grep.reason).toMatch(/would search '\.', which contains the hidden entry '\.[a-z-]+'/);
    expect(grep.reason).toContain("'Model'");
    expect(call('Glob', { pattern: '**/*' }).reason).toMatch(/hidden entry/);
    expect(call('Glob', { pattern: '**/*.lean', path: fx.root }).kind).toBe('deny');
    expect(call('Grep', { pattern: 'x', path: '.', glob: '*.lean' }).kind).toBe('deny');
  });

  it('allows Grep and Glob on a folder with no hidden entry below it', () => {
    expect(call('Glob', { pattern: '**/*.lean', path: p('Model') }).kind).toBe('pass');
    expect(call('Glob', { pattern: '**/*', path: 'Model' }).kind).toBe('pass');
    expect(call('Grep', { pattern: 'theorem', path: p('Model'), glob: '**/*.lean' }).kind).toBe('pass');
    expect(callClean('Grep', { pattern: 'theorem' }).kind).toBe('pass');
    expect(callClean('Glob', { pattern: '**/*' }).kind).toBe('pass');
  });

  it('allows Grep on a single visible file even in a folder with hidden entries', () => {
    expect(call('Grep', { pattern: 'import', path: p('Model.lean') }).kind).toBe('pass');
  });

  it('finds hidden entries at any depth', async () => {
    const nested = path.join(clean.root, 'Model', 'Spyro', '.cache');
    await mkdir(nested, { recursive: true });
    await writeFile(path.join(nested, 'notes.txt'), 'x');
    try {
      const d = callClean('Grep', { pattern: 'x' });
      expect(d.kind).toBe('deny');
      expect(d.reason).toContain(path.join('Model', 'Spyro', '.cache'));
      expect(callClean('Glob', { pattern: '*.lean', path: 'Model' }).kind).toBe('deny');
      expect(callClean('Glob', { pattern: '*.lean', path: 'Check' }).kind).toBe('pass');
    } finally {
      await rm(nested, { recursive: true, force: true });
    }
  });

  it('does not follow symlinks below the search root (ripgrep does not either)', () => {
    // clean/Model/ext -> outside/, which holds .secret/: not followed by the scan or by ripgrep.
    expect(callClean('Grep', { pattern: 'secret', path: 'Model' }).kind).toBe('pass');
    // As the search root itself, the link is resolved and checked like any path.
    expect(callClean('Grep', { pattern: 'secret', path: 'Model/ext' }).reason).toMatch(/outside the workspace copy/);
  });

  it('fails closed when the scan is too large or a folder cannot be listed', () => {
    expect(callClean('Grep', { pattern: 'x' }, { ...cleanPolicy, maxScanEntries: 2 }).reason).toMatch(/more than 2 entries/);
    const unreadable = decide(
      { hook_event_name: 'PreToolUse', tool_name: 'Glob', tool_input: { pattern: '*' }, cwd: clean.root },
      cleanPolicy,
      {
        readdir: () => {
          throw Object.assign(new Error('permission denied'), { code: 'EACCES' });
        },
      },
    );
    expect(unreadable.kind).toBe('deny');
    expect(unreadable.reason).toMatch(/cannot check '\.' for hidden entries \(EACCES\)/);
  });
});

describe('path guard: Glob and Grep patterns', () => {
  it('denies absolute patterns, .. segments and hidden names in patterns', () => {
    expect(call('Glob', { pattern: '/etc/*' }).reason).toMatch(/absolute/);
    expect(call('Glob', { pattern: '~/*' }).reason).toMatch(/absolute/);
    expect(call('Glob', { pattern: '../outside/*' }).reason).toMatch(/'\.\.'/);
    expect(call('Glob', { pattern: '**/.lake/**' }).reason).toMatch(/hidden/);
    expect(call('Glob', { pattern: '{Model,.git}/**' }).reason).toMatch(/hidden/);
    expect(call('Grep', { pattern: 'x', glob: '../*.txt' }).kind).toBe('deny');
    expect(call('Grep', { pattern: 'x', glob: '/etc/*' }).kind).toBe('deny');
  });

  it('denies patterns that can match hidden names without spelling a leading dot (verifier bypasses)', () => {
    // Checked in the clean workspace, so the pattern check alone decides.
    for (const pattern of ['?telelean/**', '[.]telelean/**', '.{telelean,lake}/**', '{.,x}*', '\\.env', '[!a]*', '[^a]*', '[,-/]x', '{a,{b,.c}}', 'Model/?x']) {
      const d = callClean('Glob', { pattern });
      expect(d.kind, pattern).toBe('deny');
      expect(d.reason, pattern).toMatch(/hidden/);
    }
    expect(callClean('Glob', { pattern: '{/etc,Model}/*' }).reason).toMatch(/absolute/);
    expect(callClean('Glob', { pattern: '\\.\\./outside/*' }).reason).toMatch(/'\.\.'/);
    expect(callClean('Glob', { pattern: '{a,b}{a,b}{a,b}{a,b}{a,b}{a,b}{a,b}{a,b}{a,b}' }).reason).toMatch(/brace alternatives/);
  });

  it('allows ordinary wildcards, braces and classes that cannot match a leading dot', () => {
    for (const pattern of ['**/*.lean', '*', '[A-Z]*.lean', '{Model,Check}/**/*.lean', 'Model/{Spyro,Other}/*', 'Model/*.{lean,toml}', './Model/*']) {
      expect(callClean('Glob', { pattern }).kind, pattern).toBe('pass');
    }
  });

  it("checks each glob of Grep's glob argument the way the CLI splits it; exclusions may name hidden entries", () => {
    expect(grepGlobTokens('*.lean .env')).toEqual(['*.lean', '.env']);
    expect(grepGlobTokens('*.lean,*.toml {a,b}')).toEqual(['*.lean', '*.toml', '{a,b}']);
    expect(callClean('Grep', { pattern: 'x', glob: '*.lean .env' }).reason).toMatch(/names a hidden entry \('\.env'\)/);
    expect(callClean('Grep', { pattern: 'x', glob: '*.lean,?env' }).kind).toBe('deny');
    expect(callClean('Grep', { pattern: 'x', glob: '!.lake/** *.lean' }).kind).toBe('pass');
    expect(callClean('Grep', { pattern: 'x', glob: '!../x' }).kind).toBe('deny');
  });
});

describe('path guard: Glob and Grep search roots', () => {

  it('denies search roots outside the shadow or through escaping symlinks', () => {
    expect(call('Glob', { pattern: '*', path: '/etc' }).kind).toBe('deny');
    expect(call('Glob', { pattern: '*', path: p('escape') }).kind).toBe('deny');
    expect(call('Grep', { pattern: 'x', path: '/home' }).kind).toBe('deny');
    expect(call('Grep', { pattern: 'x', path: p('.lake') }).kind).toBe('deny');
  });

  it('denies a default search root when the session cwd is outside the shadow', () => {
    expect(call('Glob', { pattern: '*' }, { cwd: fx.outside }).kind).toBe('deny');
  });
});

describe('path guard: tool policy', () => {
  it('passes telelean MCP tools and denies other tools', () => {
    expect(call('mcp__telelean__ask_user', { questions: [] }).kind).toBe('pass');
    expect(call('Bash', { command: 'cat /etc/passwd' }).kind).toBe('deny');
    expect(call('NotebookEdit', { notebook_path: p('x.ipynb') }).kind).toBe('deny');
    expect(call('mcp__other__tool', {}).kind).toBe('deny');
    expect(decide({ tool_name: 'Bash', tool_input: {} }, { ...policy, unknownTools: 'pass' }).kind).toBe('pass');
  });

  it('works when the policy root is itself a symlink', async () => {
    const link = path.join(fx.base, 'ws-link');
    await symlink(fx.root, link);
    const viaLink = { ...policy, root: link };
    expect(decide({ tool_name: 'Read', tool_input: { file_path: path.join(link, 'Model.lean') } }, viaLink).kind).toBe('pass');
    expect(decide({ tool_name: 'Read', tool_input: { file_path: p('Model.lean') } }, viaLink).kind).toBe('pass');
    expect(decide({ tool_name: 'Read', tool_input: { file_path: path.join(link, '.lake', 'build', 'x.olean') } }, viaLink).kind).toBe('deny');
  });

  it('formats a deny as the PreToolUse hookSpecificOutput and a pass as no output', () => {
    const out = hookOutputFor(call('Read', { file_path: '/etc/hostname' }));
    expect(out?.hookSpecificOutput.hookEventName).toBe('PreToolUse');
    expect(out?.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(hookOutputFor(call('Read', { file_path: p('Model.lean') }))).toBeUndefined();
  });
});

describe('path guard: hook protocol (run as the CLI runs it)', () => {
  const runHook = (input: unknown, policyPath: string) =>
    spawnSync(process.execPath, [defaultGuardScriptPath(), policyPath], {
      input: typeof input === 'string' ? input : JSON.stringify(input),
      encoding: 'utf8',
      timeout: 20_000,
    });

  it('prints a deny decision and exits 0 for an outside path; prints nothing for an inside path', async () => {
    const policyPath = path.join(fx.runDir, 'guard-policy.json');
    await writeFile(policyPath, JSON.stringify(policy));
    const denied = runHook({ hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: { file_path: '/etc/hostname' }, cwd: fx.root }, policyPath);
    expect(denied.status).toBe(0);
    const parsed = JSON.parse(denied.stdout) as { hookSpecificOutput: { permissionDecision: string; permissionDecisionReason: string } };
    expect(parsed.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(parsed.hookSpecificOutput.permissionDecisionReason).toMatch(/outside the workspace copy/);

    const passed = runHook({ hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: { file_path: p('Model.lean') }, cwd: fx.root }, policyPath);
    expect(passed.status).toBe(0);
    expect(passed.stdout).toBe('');
  });

  it('denies a workspace-wide Grep when the workspace holds hidden entries, and allows one scoped to Model', async () => {
    const policyPath = path.join(fx.runDir, 'guard-policy.json');
    await writeFile(policyPath, JSON.stringify(policy));
    const wide = runHook({ hook_event_name: 'PreToolUse', tool_name: 'Grep', tool_input: { pattern: 'SECRET', output_mode: 'content' }, cwd: fx.root }, policyPath);
    expect(wide.status).toBe(0);
    const reason = (JSON.parse(wide.stdout) as { hookSpecificOutput: { permissionDecisionReason: string } }).hookSpecificOutput.permissionDecisionReason;
    expect(reason).toMatch(/contains the hidden entry/);
    expect(reason).not.toContain('SECRET'); // the reason never echoes the search pattern
    const scoped = runHook({ hook_event_name: 'PreToolUse', tool_name: 'Grep', tool_input: { pattern: 'SECRET', path: 'Model' }, cwd: fx.root }, policyPath);
    expect(scoped.status).toBe(0);
    expect(scoped.stdout).toBe('');
  });

  it('logs paths but never file contents', async () => {
    const policyPath = path.join(fx.runDir, 'guard-policy.json');
    await writeFile(policyPath, JSON.stringify(policy));
    runHook({ tool_name: 'Write', tool_input: { file_path: p('Notes.lean'), content: 'SECRET-CONTENT-123' }, cwd: fx.root, tool_use_id: 'toolu_x' }, policyPath);
    const log = await readFile(path.join(fx.runDir, 'guard-log.jsonl'), 'utf8');
    expect(log).toContain('Notes.lean');
    expect(log).toContain('toolu_x');
    expect(log).not.toContain('SECRET-CONTENT-123');
  });

  it('the backend self-test passes for the real guard, and kills a hook that hangs', async () => {
    const policyPath = path.join(fx.runDir, 'guard-policy.json');
    await writeFile(policyPath, JSON.stringify(policy));
    const env = Object.fromEntries(Object.entries(process.env).filter((kv): kv is [string, string] => kv[1] !== undefined));
    const real = buildClaudeSettings({ runtime: { command: process.execPath, args: [] }, guardScriptPath: defaultGuardScriptPath(), policyPath, rootReal: fx.root });
    const ok = await selfTestGuard({ settings: real, rootReal: fx.root, policyPath }, { env });
    expect(ok.ok).toBe(true);

    const marker = `telelean-hang-probe-${process.pid}`;
    const hanging = buildClaudeSettings({
      runtime: { command: process.execPath, args: ['-e', `setInterval(() => {}, 1000) /* ${marker} */`] },
      guardScriptPath: defaultGuardScriptPath(),
      policyPath,
      rootReal: fx.root,
    });
    const timedOut = await selfTestGuard({ settings: hanging, rootReal: fx.root, policyPath }, { env, timeoutMs: 300 });
    expect(timedOut.ok).toBe(false);
    expect(timedOut.probes.map((p) => p.outcome)).toEqual(['error', 'error']);
    expect(timedOut.problems.join(' ')).toMatch(/no answer within 300 ms/);
    await new Promise((r) => setTimeout(r, 200));
    const ps = spawnSync('ps', ['-eo', 'args'], { encoding: 'utf8' });
    expect(ps.stdout).not.toContain(marker);
  });

  it('exits 2 (blocking) when the policy is missing or the input is not JSON', async () => {
    const missing = runHook({ tool_name: 'Read', tool_input: { file_path: p('Model.lean') } }, path.join(fx.runDir, 'nope.json'));
    expect(missing.status).toBe(2);
    expect(missing.stderr).toMatch(/blocking the call/);
    const policyPath = path.join(fx.runDir, 'guard-policy.json');
    await writeFile(policyPath, JSON.stringify(policy));
    expect(runHook('not json', policyPath).status).toBe(2);
    await writeFile(policyPath, JSON.stringify({ ...policy, version: 99 }));
    expect(runHook({ tool_name: 'Read', tool_input: { file_path: p('Model.lean') } }, policyPath).status).toBe(2);
  });
});
