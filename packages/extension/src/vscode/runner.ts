/**
 * The runner functions the extension calls, gathered in one replaceable record: the in-VS-Code smoke test swaps in a
 * fake ModelWorkspace (extension mode Test only), so the panels, serializer, EditApplier, clipboard, editor and diff
 * paths are exercised before the real workspace exists; unit tests replace the M2 run functions with fakes.
 *
 *   M1   workspace/   the model workspace and Initialize
 *   M2   run/         one RunManager per model root, and the Claude backend factory (createClaudeBackend)
 *        gate/        the Lean check engine (the prototype gate)
 *        proposal/    proposals, Accept and the run sidecars
 *        llm/         how the path-guard hook runs Node (defaultHookRuntime)
 *
 * The runner's subpaths are imported, never its package root. The bundle is CommonJS: the runner modules that read
 * `import.meta.url` (llm/confinement.ts, the guard module) get it from the build (scripts/esbuild-options.mjs), and the
 * extension always passes the guard script's path explicitly (logic/runs.ts).
 */
import { createLeanCheckEngine } from '@telelean/runner/gate/index.js';
import { defaultHookRuntime } from '@telelean/runner/llm/confinement.js';
import { createProposalService, createRunSidecarStore } from '@telelean/runner/proposal/index.js';
import { createClaudeBackend, createRunManager } from '@telelean/runner/run/index.js';
import {
  createModelWorkspace,
  findModelRoots,
  inspectFolder,
  planInitialize,
} from '@telelean/runner/workspace/index.js';

export interface RunnerFunctions {
  createModelWorkspace: typeof createModelWorkspace;
  findModelRoots: typeof findModelRoots;
  inspectFolder: typeof inspectFolder;
  planInitialize: typeof planInitialize;
  // M2 (docs/m2-plan.md section 8)
  createRunManager: typeof createRunManager;
  createClaudeBackend: typeof createClaudeBackend;
  createLeanCheckEngine: typeof createLeanCheckEngine;
  createProposalService: typeof createProposalService;
  createRunSidecarStore: typeof createRunSidecarStore;
  defaultHookRuntime: typeof defaultHookRuntime;
}

export const DEFAULT_RUNNER: RunnerFunctions = {
  createModelWorkspace,
  findModelRoots,
  inspectFolder,
  planInitialize,
  createRunManager,
  createClaudeBackend,
  createLeanCheckEngine,
  createProposalService,
  createRunSidecarStore,
  defaultHookRuntime,
};
