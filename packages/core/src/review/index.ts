/**
 * Slice 2, the review list (docs/slice2-plan.md sections 2.2, 2.3, 2.7, 2.9 and 4): every export of slice 2's core
 * functions. 2a1 wrote this file with the functions of later sub-slices stubbed in their own modules (each throws
 * NotImplementedError until its sub-slice), so no later sub-slice edits an index file (§1.1).
 *
 *   2a1  types.ts, view.ts (types), texts.ts, keys.ts, hash.ts, closure.ts, items.ts (computeItems, content keys)
 *   2a2  classify.ts, deps.ts, reveal.ts, reconcile.ts, reducer.ts
 *   2b1b permitted.ts (permittedFor), judge.ts (judgeState, proposeArrowProblems)
 *   2b2  backstop.ts, revert.ts, formalize.ts, submit.ts
 *   2c1  mask.ts (baseMask, maskFacts)
 *   2c2  view.ts (buildSessionView)
 *
 * Pure TypeScript: no Node or vscode APIs (the webview bundles core).
 */
export * from './types.js';
export * from './view.js';
export * from './texts.js';
export * from './keys.js';
export { canonicalJson, hashOf, reviewItemId, sha256Hex } from './hash.js';
export { constsOf, draftReach, isPropValued, reach, statementReach, usesOrRefs, type ClosureMode, type Reach, type StatementReach } from './closure.js';
export {
  commonSubsequence,
  computeItems,
  compareTexts,
  premiseDraftKey,
  reachingDraft,
  type AddedTextUnit,
  type ComputeItemsInput,
  type FileTextChanges,
  type TextChanges,
  type TextUnit,
} from './items.js';
export { classify } from './classify.js';
export { itemDeps } from './deps.js';
export { isMeaningItem, isResultOrPart, resultsState } from './reveal.js';
export { reconcile } from './reconcile.js';
export { acceptGate, planGroupAccept, planGroupDecline, reduceReview } from './reducer.js';
// Shared with the host (2c2's gates, its early answers) and the runner (2e builds ReviewState.deps), fixer 2a (V2A-S6).
export { depsById, fallbackLabel } from './records.js';
export { permittedFor } from './permitted.js';
export { judgeState, proposeArrowProblems } from './judge.js';
export { applyBackstop } from './backstop.js';
export { planItemRevert } from './revert.js';
export { planSubmit } from './submit.js';
export { formalizeOrder, formalizeStartProblems } from './formalize.js';
export { baseMask, maskFacts } from './mask.js';
