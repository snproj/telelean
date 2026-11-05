// The quota tripwire's rule for telelean's scripts (docs/m2-plan.md section 10.4): TELELEAN_NO_REAL_CLAUDE arms it with
// any non-empty value other than `0` or `false` (case and surrounding spaces ignored), exactly as the runner's
// `realClaudeDisabled()` in packages/runner/src/llm/claudeCli.ts (packages/runner/test/run/quotaTripwire.test.ts keeps
// the two in step). Plain JavaScript without imports, so a script can decide before it loads or bundles anything.
// Not a script to run.

export const NO_REAL_CLAUDE_ENV = 'TELELEAN_NO_REAL_CLAUDE';

/** Is the quota tripwire armed in `env`? */
export function quotaTripwireArmed(env = process.env) {
  const value = env[NO_REAL_CLAUDE_ENV]?.trim().toLowerCase();
  return value !== undefined && value !== '' && value !== '0' && value !== 'false';
}
