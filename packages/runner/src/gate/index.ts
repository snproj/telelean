/**
 * WP2: the Lean check engine (docs/m2-plan.md sections 3 and 4.3; contracts in ./types.ts). Signatures and documented
 * behaviour are FROZEN.
 *
 * Implementation: ./engine.ts (the engine), ./findings.ts (pure mappings of facts statuses and comparator verdicts to
 * findings and environment outcomes), ./scratch.ts (the ghost check and statement rendering files), ./session.ts (slice
 * 2b3b: the pure helpers of an edit session's judgements).
 */
import { createEngine } from './engine.js';
import type { LeanCheckEngine, LeanCheckEngineOptions } from './types.js';

export * from './types.js';
export { BASE_FACTS_FILE, CHALLENGE_MODULE_NAME, COMPLETION_STEP, filesKey, projectModulesOf, removalClosure } from './engine.js';
export {
  BASE_PROBE_FAILED,
  baseProbeEnvironment,
  budgetFinding,
  buildErrorFindings,
  classifyFacts,
  COMPARATOR_FINDING_CODES,
  comparatorFindings,
  diagnosticsOf,
  environmentMessage,
  notFrozenFinding,
  PROBE_OUT_OF_MEMORY,
  probeFailedEnvironment,
  probeOomEnvironment,
  unseenProofEnvironment,
  type ComparatorOutcome,
  type FactsOutcome,
} from './findings.js';
export {
  completionScope,
  explicitBody,
  finalCheckFailures,
  finalRuleOf,
  relianceKey,
  sameNames,
  sessionContextKey,
  sessionPermitted,
  sessionProofTargets,
  statementFactsOf,
  withG0,
} from './session.js';
export {
  collapseWhitespace,
  EXPLICIT_OPTIONS,
  GHOST_CHECK_NAME,
  GHOST_NEEDS_FREEZE,
  GHOST_STATEMENT_NAME,
  ghostScratchSource,
  parseNamedAxiomsMessage,
  readGhostScratch,
  readRenderScratch,
  renderScratchSource,
  type GhostScratch,
  type GhostScratchResult,
  type RenderScratch,
} from './scratch.js';

/**
 * The engine. Each method serialises its Lean jobs through `semantic.runExclusive` (one Lean job at a time in the
 * extension host, shared with the M1 refreshes), never throws for Lean or sandbox failures (they are `environment`
 * outcomes or findings), and throws TypeError only for invalid arguments.
 */
export function createLeanCheckEngine(options: LeanCheckEngineOptions = {}): LeanCheckEngine {
  return createEngine(options);
}
