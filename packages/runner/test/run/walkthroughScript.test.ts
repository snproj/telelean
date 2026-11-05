/**
 * AT3.16, the part that runs before integration (docs/m2-plan.md sections 10.4 and 12.1): scripts/walkthrough-claude.mjs
 * is live only with `--live` AND TELELEAN_WALKTHROUGH_LIVE=yes; either alone (and the other contradictions) refuses
 * before anything is bundled, copied or resolved: no Claude binary is looked up or run (a fake `--binary` that would
 * record any invocation stays untouched) and the work dir is not even created. The full dry run (both readings with
 * the FakeBackend and real Lean) is the integrator's (it needs WP1, WP2 and WP4). Fixer round 2: the quota tripwire
 * refuses `--live` for every arming value (`true` too), by the runner's rule (see also quotaTripwire.test.ts, which
 * checks the rule without running the script).
 */
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { cleanup, makeTempDir, REPO_ROOT } from './helpers/env.js';

const SCRIPT = path.join(REPO_ROOT, 'scripts', 'walkthrough-claude.mjs');
let base: string;
let marker: string;
let fakeClaude: string;

beforeAll(() => {
  base = makeTempDir('walkscript');
  marker = path.join(base, 'claude-was-run');
  fakeClaude = path.join(base, 'bin', 'claude');
  mkdirSync(path.dirname(fakeClaude), { recursive: true });
  writeFileSync(fakeClaude, `#!/bin/sh\necho "$*" >> "${marker}"\necho "2.1.400 (Claude Code)"\n`);
  chmodSync(fakeClaude, 0o755);
});
afterAll(() => cleanup(base));

function runScript(args: string[], env: Record<string, string | undefined>) {
  const workDir = path.join(base, `work-${Math.random().toString(16).slice(2)}`);
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries({ ...process.env, ...env })) if (v !== undefined && k !== 'TELELEAN_WALKTHROUGH_LIVE') clean[k] = v;
  if (env['TELELEAN_WALKTHROUGH_LIVE'] !== undefined) clean['TELELEAN_WALKTHROUGH_LIVE'] = env['TELELEAN_WALKTHROUGH_LIVE'];
  const r = spawnSync(process.execPath, [SCRIPT, ...args, '--work-dir', workDir, '--binary', fakeClaude], { env: clean, encoding: 'utf8', timeout: 60_000 });
  return { status: r.status, stderr: r.stderr, stdout: r.stdout, workDir };
}

describe('scripts/walkthrough-claude.mjs refuses a half-armed live run (AT3.16)', () => {
  it('--live without TELELEAN_WALKTHROUGH_LIVE=yes', () => {
    const r = runScript(['--live'], { TELELEAN_NO_REAL_CLAUDE: undefined });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('refused: --live also needs TELELEAN_WALKTHROUGH_LIVE=yes in the environment');
    expect(existsSync(marker)).toBe(false);
    expect(existsSync(r.workDir)).toBe(false);
    expect(r.stdout).toBe('');
  });

  it('TELELEAN_WALKTHROUGH_LIVE=yes without --live', () => {
    const r = runScript([], { TELELEAN_WALKTHROUGH_LIVE: 'yes', TELELEAN_NO_REAL_CLAUDE: undefined });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('TELELEAN_WALKTHROUGH_LIVE=yes is set but --live is not given');
    expect(existsSync(marker)).toBe(false);
    expect(existsSync(r.workDir)).toBe(false);
  });

  it('both flags while the quota tripwire is set in the environment (as in every test runner)', () => {
    expect(process.env['TELELEAN_NO_REAL_CLAUDE']).toBe('1');
    const r = runScript(['--live'], { TELELEAN_WALKTHROUGH_LIVE: 'yes' });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('TELELEAN_NO_REAL_CLAUDE=1 is set in this environment');
    expect(existsSync(marker)).toBe(false);
    expect(existsSync(r.workDir)).toBe(false);
  });

  it('both flags while the tripwire is armed by another value (fixer round 2: any non-empty value but 0/false, the runner\'s rule)', () => {
    const r = runScript(['--live'], { TELELEAN_WALKTHROUGH_LIVE: 'yes', TELELEAN_NO_REAL_CLAUDE: 'true' });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('TELELEAN_NO_REAL_CLAUDE=true is set in this environment');
    expect(existsSync(marker)).toBe(false);
    expect(existsSync(r.workDir)).toBe(false);
    expect(r.stdout).toBe('');
  });

  it('contradictory or unknown options', () => {
    const both = runScript(['--live', '--dry-run'], { TELELEAN_WALKTHROUGH_LIVE: 'yes', TELELEAN_NO_REAL_CLAUDE: undefined });
    expect(both.status).toBe(2);
    expect(both.stderr).toContain('--live and --dry-run exclude each other');
    const reading = runScript(['--dry-run', '--reading', 'sarcastic'], {});
    expect(reading.status).toBe(2);
    expect(reading.stderr).toContain('--reading must be normative, literal or both');
    const unknown = runScript(['--dry-run', '--no-such-flag'], {});
    expect(unknown.status).toBe(2);
    expect(unknown.stderr).toContain("Unknown option '--no-such-flag'");
    expect(existsSync(marker)).toBe(false);
    expect(existsSync(reading.workDir)).toBe(false);
  });
});
