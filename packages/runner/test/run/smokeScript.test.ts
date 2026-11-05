/**
 * M2 fixer round 1 (safety lens): scripts/smoke-claude.mjs, M0's live smoke test, is dry by default and live only with
 * `--live` AND TELELEAN_SMOKE_LIVE=yes, like scripts/walkthrough-claude.mjs (docs/m2-plan.md section 10.4, tripwire 3:
 * "no default anywhere starts a session"). Either switch alone (and the other contradictions) refuses before any
 * module is loaded, any directory is made or any binary is resolved: a fake `--binary` that records every invocation
 * stays untouched and the work dir is not created. Every invocation passes that fake binary and keeps the quota
 * tripwire TELELEAN_NO_REAL_CLAUDE=1 set, so even a broken refusal could not reach a real Claude. The dry run itself
 * (with `--dry-run`) runs only the fake's `--version`.
 */
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { cleanup, makeTempDir, REPO_ROOT } from './helpers/env.js';

const SCRIPT = path.join(REPO_ROOT, 'scripts', 'smoke-claude.mjs');
let base: string;
let marker: string;
let fakeClaude: string;

beforeAll(() => {
  base = makeTempDir('smokescript');
  marker = path.join(base, 'claude-was-run');
  fakeClaude = path.join(base, 'bin', 'claude');
  mkdirSync(path.dirname(fakeClaude), { recursive: true });
  writeFileSync(fakeClaude, `#!/bin/sh\necho "$*" >> "${marker}"\necho "2.1.400 (Claude Code)"\n`);
  chmodSync(fakeClaude, 0o755);
});
afterAll(() => cleanup(base));
beforeEach(() => rmSync(marker, { force: true }));

function runScript(args: string[], env: Record<string, string | undefined>) {
  const workDir = path.join(base, `work-${Math.random().toString(16).slice(2)}`);
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries({ ...process.env, ...env })) if (v !== undefined && k !== 'TELELEAN_SMOKE_LIVE') clean[k] = v;
  if (env['TELELEAN_SMOKE_LIVE'] !== undefined) clean['TELELEAN_SMOKE_LIVE'] = env['TELELEAN_SMOKE_LIVE'];
  // The quota tripwire stays armed in every case.
  clean['TELELEAN_NO_REAL_CLAUDE'] = '1';
  const r = spawnSync(process.execPath, [SCRIPT, ...args, '--work-dir', workDir, '--binary', fakeClaude], { env: clean, encoding: 'utf8', timeout: 120_000 });
  return { status: r.status, stderr: r.stderr, stdout: r.stdout, workDir };
}

describe('scripts/smoke-claude.mjs is dry by default and refuses a half-armed live run', () => {
  it('--live without TELELEAN_SMOKE_LIVE=yes', () => {
    const r = runScript(['--live'], {});
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('refused: --live also needs TELELEAN_SMOKE_LIVE=yes in the environment');
    expect(existsSync(marker)).toBe(false);
    expect(existsSync(r.workDir)).toBe(false);
    expect(r.stdout).toBe('');
  });

  it('TELELEAN_SMOKE_LIVE=yes without --live', () => {
    const r = runScript(['--dry-run'], { TELELEAN_SMOKE_LIVE: 'yes' });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('TELELEAN_SMOKE_LIVE=yes is set but --live is not given');
    expect(existsSync(marker)).toBe(false);
    expect(existsSync(r.workDir)).toBe(false);
  });

  it('both switches while the quota tripwire is set (as in every test runner)', () => {
    expect(process.env['TELELEAN_NO_REAL_CLAUDE']).toBe('1');
    const r = runScript(['--live'], { TELELEAN_SMOKE_LIVE: 'yes' });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('TELELEAN_NO_REAL_CLAUDE is set in this environment');
    expect(existsSync(marker)).toBe(false);
    expect(existsSync(r.workDir)).toBe(false);
  });

  it('contradictory or unknown options', () => {
    const both = runScript(['--live', '--dry-run'], { TELELEAN_SMOKE_LIVE: 'yes' });
    expect(both.status).toBe(2);
    expect(both.stderr).toContain('--live and --dry-run exclude each other');
    const targets = runScript(['--dry-run', '--read-bashrc', '--safe-targets'], {});
    expect(targets.status).toBe(2);
    expect(targets.stderr).toContain('--read-bashrc and --safe-targets contradict each other');
    const unknown = runScript(['--dry-run', '--no-such-flag'], {});
    expect(unknown.status).toBe(2);
    expect(unknown.stderr).toContain("Unknown option '--no-such-flag'");
    expect(existsSync(marker)).toBe(false);
    expect(existsSync(targets.workDir)).toBe(false);
  });

  it('the dry run runs nothing but the fake binary\'s --version and starts no session', () => {
    const r = runScript(['--dry-run', '--scenario', 'a'], {});
    expect(r.status, r.stderr).toBe(0);
    const summary = JSON.parse(r.stdout) as { mode: string; binary: { path: string; version: string } };
    expect(summary.mode).toBe('dry-run');
    expect(summary.binary).toMatchObject({ path: fakeClaude, version: '2.1.400' });
    expect(readFileSync(marker, 'utf8').trim().split('\n')).toEqual(['--version']);
    expect(r.stderr).not.toContain('LIVE RUN');
  });

  it('the mode is decided before anything is loaded: dry unless both switches are given', () => {
    const source = readFileSync(SCRIPT, 'utf8');
    const decided = source.indexOf('const LIVE = argv.live === true;');
    expect(decided).toBeGreaterThan(0);
    expect(source).toContain('const DRY = !LIVE;');
    // The runner modules (and so any binary resolution) load only after the mode is decided.
    expect(source.indexOf("await import(pathToFileURL(path.join(REPO, 'packages/runner/src/llm/index.ts')).href)")).toBeGreaterThan(decided);
    expect(source.indexOf('resolveClaudeBinary(')).toBeGreaterThan(decided);
  });
});
