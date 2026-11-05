/**
 * Fixer round 2 (M2 final verification): scripts/walkthrough-claude.mjs refuses `--live` at once whenever the quota
 * tripwire is armed by the runner's own rule (any non-empty value but `0`/`false`), not only for exactly `1`
 * (docs/m2-plan.md sections 10.4 and 12.2). The rule lives in scripts/quota-tripwire.mjs; this test checks it against
 * the runner's `realClaudeDisabled()` value by value, and that the script decides with it before it bundles, copies
 * or resolves anything. It never runs a script (walkthroughScript.test.ts does, with a fake `--binary` and the
 * tripwire armed).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

import { realClaudeDisabled } from '../../src/llm/index.js';
import { REPO_ROOT } from './helpers/env.js';

const HELPER = path.join(REPO_ROOT, 'scripts', 'quota-tripwire.mjs');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'walkthrough-claude.mjs');

type Env = Record<string, string | undefined>;

describe('the scripts\' quota tripwire follows the runner\'s rule', () => {
  it('arms exactly when realClaudeDisabled() does, for every spelling', async () => {
    const { quotaTripwireArmed } = (await import(pathToFileURL(HELPER).href)) as { quotaTripwireArmed: (env: Env) => boolean };
    const values = [undefined, '', '  ', '0', ' 0 ', 'false', 'FALSE', ' False ', '1', ' 1 ', 'true', 'TRUE', 'yes', 'on', 'no', '2'];
    for (const value of values) {
      const env: Env = value === undefined ? {} : { TELELEAN_NO_REAL_CLAUDE: value };
      expect(quotaTripwireArmed(env), JSON.stringify(value)).toBe(realClaudeDisabled(env));
    }
    expect(quotaTripwireArmed({ TELELEAN_NO_REAL_CLAUDE: 'true' })).toBe(true);
    expect(quotaTripwireArmed({ TELELEAN_NO_REAL_CLAUDE: 'false' })).toBe(false);
  });

  it('scripts/walkthrough-claude.mjs refuses --live with it, before it bundles, copies or resolves anything', () => {
    const source = readFileSync(SCRIPT, 'utf8');
    expect(source).toContain("import { NO_REAL_CLAUDE_ENV, quotaTripwireArmed } from './quota-tripwire.mjs';");
    expect(source).not.toContain("TELELEAN_NO_REAL_CLAUDE === '1'");
    const refusal = source.indexOf('if (argv.live && quotaTripwireArmed(process.env)) refuse(');
    expect(refusal).toBeGreaterThan(0);
    for (const later of ["await import('esbuild')", 'mkdirSync(work', 'cpSync(']) {
      const at = source.indexOf(later, source.indexOf('// ---- The mode'));
      expect(at, later).toBeGreaterThan(refusal);
    }
  });
});
