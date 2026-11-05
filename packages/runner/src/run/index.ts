/**
 * WP3: the run controller, its tool host, prompts, the Claude backend factory and preflight (docs/m2-plan.md
 * sections 2, 4 and 5; contracts in ./types.ts). Signatures and documented behaviour are FROZEN; the implementations
 * live in the modules next to this file:
 *
 *   manager.ts      createRunManager: the state machine, the AgentToolHost, caps and clock, the gate loop, Accept
 *   preflight.ts    runPreflight (section 4.1)
 *   backend.ts      createClaudeBackend (binary resolution, the setpriv launcher, the quota tripwire)
 *   prompts.ts      the context bundle (5.2) and the later user turns (5.3); systemPrompt.ts holds 5.1 verbatim
 *   persist.ts      run.json (atomic), transcript.jsonl, the scan of a root's run directories
 */
import { DEFAULT_RUN_CAPS } from '@telelean/core';

import type { ResolvedBinary } from '../llm/binary.js';
import type { ClaudeCliBackend } from '../llm/claudeCli.js';
import { createClaudeBackendImpl } from './backend.js';
import { createRunManagerImpl } from './manager.js';
import { preflight } from './preflight.js';
import { renderContextBundle, SYSTEM_PROMPT } from './prompts.js';
import type {
  ClaudeBackendSettings,
  ContextBundleInput,
  PreflightInput,
  PreflightOutcome,
  RunManager,
  RunManagerOptions,
  RunSettings,
} from './types.js';

export * from './types.js';
// Additive exports (WP3): the later user turns, helpers the tests and the walkthrough script use.
export { adoptionTurn, budgetText, collapseWhitespace, feedbackTurn, NUDGE_TURN, resumeTurn, shortNames } from './prompts.js';
export { condenseRateLimit, ENVIRONMENT_RETRY_MS, gateCheckOf, localTime, rateLimitNotice, validateAnswers, verdictOfStatus } from './manager.js';
export { missingWorkspaceMembers } from './preflight.js';
export { PDEATHSIG_ARGS, setprivLauncher } from './backend.js';
export { readPersistedRun, scanRuns, type ScannedRun } from './persist.js';

/** D-25 / 03 section 8.6 defaults (the extension overrides them from `telelean.*`). Implemented with the contract. */
export const DEFAULT_RUN_SETTINGS: RunSettings = {
  model: 'claude-opus-5-5',
  effort: 'high',
  caps: DEFAULT_RUN_CAPS,
  memoryMax: '4G',
  minAvailableBytes: 2 * 1024 ** 3,
  contextScope: 'subject',
  keepRuns: 10,
  reuseLeanBuild: false,
};

/** One root's RunManager (state machine of docs/m2-plan.md section 2). */
export function createRunManager(options: RunManagerOptions): RunManager {
  return createRunManagerImpl(options);
}

/**
 * Resolves the user's Claude Code binary (setting -> newest VS Code Claude Code extension binary -> PATH ->
 * ~/.local/bin; `--version` >= llm.MIN_CLAUDE_VERSION 2.1.295) and builds the ClaudeCliBackend with the explicit
 * guard script path, the hook runtime, the client app, and (default) the `setpriv --pdeathsig KILL` launcher. Contacts
 * nothing but `claude --version`. Throws LlmHarnessError `binary` with every candidate tried.
 * Quota tripwire (reviewer addition, docs/m2-plan.md section 10.4): when `process.env.TELELEAN_NO_REAL_CLAUDE` is `1`
 * (set by every test runner and by the walkthrough script's dry run), it throws LlmHarnessError `process` before
 * resolving anything unless `settings.resolve` is given (the fake-binary tests), and `ClaudeCliBackend.startSession`
 * refuses to spawn unless its launcher is `process.execPath` (M0's fake-claude.mjs double).
 */
export async function createClaudeBackend(settings: ClaudeBackendSettings): Promise<{ backend: ClaudeCliBackend; binary: ResolvedBinary }> {
  return createClaudeBackendImpl(settings);
}

/** The checks of docs/m2-plan.md section 4.1 before anything is created or spent (auth and hooks come at session start). */
export async function runPreflight(input: PreflightInput): Promise<PreflightOutcome> {
  return preflight(input);
}

/**
 * The static system prompt (docs/m2-plan.md section 5.1, verbatim). Byte-identical across runs and projects, so the
 * CLI's prompt cache is reused; everything project-specific goes into the first user turn.
 */
export function buildSystemPrompt(): string {
  return SYSTEM_PROMPT;
}

/** The first user turn of a run (docs/m2-plan.md section 5.2): the action, target, selection, index, vocabulary, decisions, budget. */
export function buildContextBundle(input: ContextBundleInput): string {
  return renderContextBundle(input);
}
