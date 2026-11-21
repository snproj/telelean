/**
 * Preflight of a run, Formalize for dependencies (docs/m2-plan.md section 4.1; spec v4.1 ES-2, renamed from "These
 * suffice" in slice 1e; the extension host checks the arrows first, core `formalizeStartProblem`): the checks that run
 * before anything is created,
 * declared, spawned or sent, in this order, each refusal one plain sentence:
 *   1 busy       another non-terminal run of the root
 *   2 selection  the target is a PROPOSITION card of the subject (spec v4), every premise is a card of the subject,
 *                the target is not among the premises
 *   3 workspace  the ModelWorkspace implements the M2 members and the subject loads
 *   4 toolchain  lean-toolchain pins leanprover/lean4:v4.35.0 (D-7), a lakefile exists, the manifest lists no packages
 *   5 sandbox    lean.checkSandboxSupport(), then lean.checkUserNamespaces() (turn 13: bwrap can create its namespaces,
 *                which a kernel's AppArmor userns restriction prevents outside the VS Code snap)
 *   6 memory     MemAvailable >= the guard
 * The CLI's own checks (guard self-test, subscription login, hooks listing) come at session start, also before the
 * first prompt.
 */
import { FORMALIZE_START_TEXTS, PINNED_TOOLCHAIN_NAME, type TlGraph } from '@telelean/core';

import { checkSandboxSupport, checkUserNamespaces } from '../lean/runLean.js';
import { readMemAvailableBytes } from '../semantic/index.js';
import type { ModelWorkspace } from '../workspace/types.js';
import type { PreflightInput, PreflightOutcome, PreflightProblem } from './types.js';

const M2_MEMBERS = ['applyChanges', 'readText', 'modelFiles', 'library', 'projectModel', 'reloadAttempts'] as const;

/** The selection refusal for an axiom as the target (docs/slice1-plan.md 1a, spec v4 AR-6; core's text since slice 1e). */
export const AXIOM_TARGET_REFUSAL: string = FORMALIZE_START_TEXTS.axiomTarget;

const refuse = (problem: PreflightProblem, message: string): PreflightOutcome => ({ ok: false, problem, message });

function gib(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

/** The M2 members a workspace lacks (the extension's real workspace has them all). */
export function missingWorkspaceMembers(workspace: ModelWorkspace): string[] {
  return M2_MEMBERS.filter((m) => typeof (workspace as unknown as Record<string, unknown>)[m] !== 'function');
}

async function readProjectFile(input: PreflightInput, rel: string): Promise<string | null> {
  const read = input.workspace.readText;
  if (typeof read !== 'function') return null;
  try {
    return await read.call(input.workspace, rel);
  } catch {
    return null;
  }
}

function selectionProblem(input: PreflightInput, graph: TlGraph): string | undefined {
  const { target, premises, subject } = input.request;
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const t = byId.get(target);
  if (t === undefined) return `The target "${target}" is not a card of ${subject}.`;
  if (t.type !== 'PROPOSITION') return AXIOM_TARGET_REFUSAL;
  for (const p of premises) {
    if (p === target) return `The target "${t.naturalName}" cannot also be one of its own premises.`;
    if (!byId.has(p)) return `The premise "${p}" is not a card of ${subject}.`;
  }
  return undefined;
}

async function toolchainProblem(input: PreflightInput): Promise<string | undefined> {
  const toolchain = (await readProjectFile(input, 'lean-toolchain'))?.trim();
  if (toolchain === undefined) return 'lean-toolchain is missing, so Lean cannot check this model folder.';
  if (toolchain !== PINNED_TOOLCHAIN_NAME) {
    return `lean-toolchain pins ${JSON.stringify(toolchain)}; telelean runs Claude only on ${PINNED_TOOLCHAIN_NAME} (D-7).`;
  }
  const lakefile = (await readProjectFile(input, 'lakefile.toml')) ?? (await readProjectFile(input, 'lakefile.lean'));
  if (lakefile === null) return 'The model folder has no lakefile.toml or lakefile.lean.';
  const manifest = await readProjectFile(input, 'lake-manifest.json');
  if (manifest === null) return 'lake-manifest.json is missing (the sandbox keeps the model folder read-only, so Lake cannot write one).';
  let packages: unknown;
  try {
    packages = (JSON.parse(manifest) as { packages?: unknown }).packages;
  } catch (e) {
    return `lake-manifest.json is not valid JSON: ${(e as Error).message}.`;
  }
  if (!Array.isArray(packages)) return 'lake-manifest.json has no "packages" list.';
  if (packages.length > 0) {
    const names = packages.map((p: unknown) => (typeof p === 'object' && p !== null && typeof (p as { name?: unknown }).name === 'string' ? (p as { name: string }).name : '?'));
    return `This project has Lake dependencies (${names.join(', ')}); runs support only dependency-free models (Mathlib needs an explicit opt-in, M4).`;
  }
  return undefined;
}

/** The checks of docs/m2-plan.md section 4.1 before anything is created or spent (auth and hooks come at session start). */
export async function preflight(input: PreflightInput): Promise<PreflightOutcome> {
  // 1. busy
  if (input.activeRunId !== undefined) {
    return refuse('busy', `Another Claude run of this model folder is still active (${input.activeRunId}): finish, Discard or Cancel it first.`);
  }
  // 2. selection (needs the subject's board) and 3. workspace
  let graph: TlGraph;
  try {
    graph = input.workspace.graph(input.request.subject);
  } catch (e) {
    return refuse('workspace', `The subject ${input.request.subject} could not be loaded: ${(e as Error).message}`);
  }
  const selection = selectionProblem(input, graph);
  if (selection !== undefined) return refuse('selection', selection);
  const missing = missingWorkspaceMembers(input.workspace);
  if (missing.length > 0) return refuse('workspace', `This workspace cannot run Claude yet (it lacks ${missing.join(', ')}).`);
  // 4. toolchain
  const toolchain = await toolchainProblem(input);
  if (toolchain !== undefined) return refuse('toolchain', toolchain);
  // 5. sandbox
  const sandbox = await (input.checkSandbox ?? (async () => (await checkSandboxSupport()) ?? (await checkUserNamespaces())))();
  if (sandbox !== undefined) return refuse('sandbox', `Lean's sandbox is not available, so telelean cannot check Claude's work: ${sandbox}.`);
  // 6. memory
  const available = (input.readMemAvailable ?? readMemAvailableBytes)();
  if (available !== undefined && available < input.settings.minAvailableBytes) {
    return refuse(
      'memory',
      `Only ${gib(available)} of memory is available (telelean needs ${gib(input.settings.minAvailableBytes)} free to run Lean safely): close something and try again.`,
    );
  }
  return { ok: true };
}
