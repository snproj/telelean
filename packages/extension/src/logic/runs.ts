/**
 * M2 Claude runs on the host side, without the vscode API (docs/m2-plan.md section 8):
 *
 *   egress consent      asked once per model root before its first run (8.2); a yes is remembered in the model folder,
 *                       `.telelean/runs/consent.json` (2k2, docs/slice2-plan.md 2.10, D2-110)
 *   the Claude backend  built lazily, by a factory the root's RunManager calls at the first start that passed
 *                       preflight (8.4): the explicit guard script path in dist/bin, the hook runtime, the client
 *                       app, the `setpriv --pdeathsig KILL` launcher, and the folder of the Claude Code extension VS
 *                       Code runs searched first for its binary. Opening a board never resolves or runs a binary.
 *   Test-mode guard     in ExtensionMode.Test the factory refuses ("real Claude is disabled in Test mode") and never
 *                       calls createClaudeBackend; only a backend a test installs (`testing.useRunBackend`) runs
 *   busy check          at most one active run per root: a start while one is active is refused (`conflict`)
 */
import { readFile, realpath, rm, writeFile } from 'node:fs/promises';
import * as path from 'node:path';

import { isTerminalRunState, RUN_MESSAGE_TYPES, type RunView, type WebviewToHostMessage } from '@telelean/core';
import type { ResolvedBinary } from '@telelean/runner/llm/binary.js';
import { ensureRunsDir, runsDirOf } from '@telelean/runner/shadow/index.js';
import type { HookRuntime } from '@telelean/runner/llm/confinement.js';
import type { LlmBackend } from '@telelean/runner/llm/types.js';
import type { ClaudeBackendSettings, RunManager } from '@telelean/runner/run/types.js';

// ---------------------------------------------------------------------------------------------
// Run messages

/** The webview messages that act on a run (core RUN_MESSAGE_TYPES), routed to the root's RunManager. */
export type RunRequestType = (typeof RUN_MESSAGE_TYPES)[number];
export type RunRequestMessage = Extract<WebviewToHostMessage, { type: RunRequestType }>;

export function isRunRequest(message: WebviewToHostMessage): message is RunRequestMessage {
  return (RUN_MESSAGE_TYPES as readonly string[]).includes(message.type);
}

/**
 * A root's Claude runs as a board session sees them: its RunManager (which lives with the model workspace, so a run
 * survives closing the board, D-25) and the recovery after a reload, or why there are none.
 */
export type RunsHandle =
  | {
      manager: RunManager;
      /** Settles once `recover()` is done (questions and proposals of an earlier session are back); never rejects. */
      recovered: Promise<void>;
    }
  | { unavailable: string };

/** Shown when a build has no RunManager at all. */
export const RUNS_UNAVAILABLE = 'Claude runs are not available in this window.';

// ---------------------------------------------------------------------------------------------
// Egress consent (docs/m2-plan.md section 8.2)

/**
 * 2k2 (D2-110, D2-123, U3): the consent of one model folder lives in it, inside its git-ignored runs folder, and names the
 * folder (its real path), so a clone (git leaves the file out), a copy, a move or a rename never carries it, and a folder
 * recreated at the same path starts without it. Only a yes is written. (Until 2k2 it was VS Code's `globalState` key
 * `telelean.claudeConsent.<rootKey>`, which is never read or removed now, U5.)
 */
export const CONSENT_FILE = 'consent.json';

/** The folder as the consent names it: its real path (a symlinked spelling is the same folder), else its resolved path. */
async function canonicalRoot(root: string): Promise<string> {
  try {
    return await realpath(root);
  } catch {
    return path.resolve(root);
  }
}

/** The consent file's exact text for the model folder `root`: nothing else counts as a yes there. */
export async function consentText(root: string): Promise<string> {
  return `${JSON.stringify({ format: 'telelean-consent', version: 1, claude: true, root: await canonicalRoot(root) })}\n`;
}

export function consentPath(root: string): string {
  return path.join(runsDirOf(root), CONSENT_FILE);
}

/** Whether the model folder `root` holds a yes for itself (never throws: an unreadable file, or another folder's, is a no). */
export async function hasConsent(root: string): Promise<boolean> {
  try {
    return (await readFile(consentPath(root), 'utf8')) === (await consentText(root));
  } catch {
    return false;
  }
}

/** Remembers a yes in the model folder (the runs folder and its `.gitignore` made first, D2-109). */
export async function rememberConsent(root: string): Promise<void> {
  await ensureRunsDir(runsDirOf(root));
  await writeFile(consentPath(root), await consentText(root), { encoding: 'utf8', mode: 0o600 });
}

/** Test mode's reset: forgets the consent of `root` (nothing else in its runs folder). */
export async function forgetConsent(root: string): Promise<void> {
  await rm(consentPath(root), { force: true });
}

/** The modal's message and detail: together exactly the text of docs/m2-plan.md section 8.2. */
export const CONSENT_MESSAGE = 'Run Claude on this model?';
export const CONSENT_DETAIL =
  "telelean sends this subject's cards (sentences, reasons, Lean statements), its vocabulary and your recorded answers, plus any model file Claude reads, to Anthropic through your Claude Code login (your claude.ai subscription; no API key).";
/** The modal's button (VS Code adds "Cancel"). */
export const CONSENT_YES = 'Run with Claude';
/** The refusal when the user did not allow it (nothing was sent, declared or started). */
/** The refusal when the user declines. Keep the "Not started:" start: the board shows such a refusal as information. */
export const CONSENT_DECLINED = 'Not started: telelean sends nothing to Claude until you allow it ("Run with Claude").';

// ---------------------------------------------------------------------------------------------
// The Claude backend (docs/m2-plan.md section 8.4)

/** What the factory refuses with in ExtensionMode.Test when no test installed a backend (quota tripwire 2). */
export const TEST_MODE_NO_CLAUDE = 'real Claude is disabled in Test mode';
/** The runner's PreToolUse path guard, copied by scripts/build.mjs to `dist/bin/`. */
export const GUARD_SCRIPT_NAME = 'telelean-path-guard.mjs';
/** The VS Code Claude Code extension (amendment A1: its binary is the default Claude Code). */
export const CLAUDE_EXTENSION_ID = 'anthropic.claude-code';

/**
 * The guard script's absolute path in the installed extension. Always passed explicitly: in the CommonJS bundle the
 * runner's own default (relative to `import.meta.url`) would point at the bundle's folder, not at the script.
 */
export function guardScriptPath(extensionRoot: string): string {
  return path.join(extensionRoot, 'dist', 'bin', GUARD_SCRIPT_NAME);
}

/**
 * Where the binary search looks for the Claude Code extension: the folder holding the Claude Code extension VS Code
 * actually runs first (so its binary is the one found), then the runner's defaults (~/.vscode/extensions,
 * ~/.vscode-server/extensions), without duplicates. (Passing the list replaces the runner's defaults, so they are
 * repeated here.)
 */
export function claudeExtensionDirs(claudeExtensionPath: string | undefined, home: string): string[] {
  const dirs = [
    ...(claudeExtensionPath ? [path.dirname(claudeExtensionPath)] : []),
    path.join(home, '.vscode', 'extensions'),
    path.join(home, '.vscode-server', 'extensions'),
  ];
  return [...new Set(dirs)];
}

/** `~` and `~/…` in a setting (no shell expands them for the binary search). */
export function expandHome(file: string, home: string): string {
  if (file === '~') return home;
  if (file.startsWith('~/')) return path.join(home, file.slice(2));
  return file;
}

export interface ClaudeBackendInput {
  /** The installed extension's folder (`ExtensionContext.extensionUri.fsPath`). */
  extensionRoot: string;
  /** The extension's version (package.json). */
  version: string;
  /** `telelean.claude.path` ('' = automatic). */
  claudePath: string;
  /** `vscode.extensions.getExtension('anthropic.claude-code')?.extensionPath`. */
  claudeExtensionPath: string | undefined;
  home: string;
  /** `llm.defaultHookRuntime()`: how the hook runs Node (a real `node` preferred inside the Electron host). */
  hookRuntime: HookRuntime;
}

/** The settings the production factory passes to `run.createClaudeBackend`. */
export function claudeBackendSettings(input: ClaudeBackendInput): ClaudeBackendSettings {
  const claudePath = input.claudePath.trim();
  return {
    ...(claudePath ? { claudePath: expandHome(claudePath, input.home) } : {}),
    guardScriptPath: guardScriptPath(input.extensionRoot),
    hookRuntime: input.hookRuntime,
    clientApp: `telelean/${input.version}`,
    pdeathsig: true,
    extensionDirs: claudeExtensionDirs(input.claudeExtensionPath, input.home),
  };
}

/** A backend a test installs with `testing.useRunBackend` (FakeBackend scripts), per model root. */
export type RunBackendOverride = (root: string) => LlmBackend | Promise<LlmBackend>;

export interface RunBackendDeps {
  root: string;
  /** `context.extensionMode === ExtensionMode.Test`. */
  isTest: boolean;
  /** Test mode: the backend a test installed, read when the factory runs. */
  override: () => RunBackendOverride | undefined;
  /** Production: computed when the factory runs (the first start that passed preflight). */
  settings: () => ClaudeBackendSettings;
  createClaudeBackend: (settings: ClaudeBackendSettings) => Promise<{ backend: LlmBackend; binary: ResolvedBinary }>;
  log: (level: 'info' | 'warn' | 'error', message: string) => void;
}

/**
 * `RunServices.backend` for one root: the RunManager calls it at the first start that passed preflight (and again
 * after a failure). A rejection refuses that start (`not-yet`, with its message, e.g. the binary candidates tried).
 * In Test mode it never reaches `createClaudeBackend`.
 */
export function runBackendFactory(deps: RunBackendDeps): () => Promise<LlmBackend> {
  return async () => {
    if (deps.isTest) {
      const override = deps.override();
      if (!override) throw new Error(TEST_MODE_NO_CLAUDE);
      return await override(deps.root);
    }
    const { backend, binary } = await deps.createClaudeBackend(deps.settings());
    deps.log('info', `Claude Code ${binary.version} (${binary.source}): ${binary.path}`);
    return backend;
  };
}

// ---------------------------------------------------------------------------------------------
// Starting a run

/**
 * Why a start is refused while `run` (the root's current run) is active; undefined when there is none. Slice 2d: a
 * mid-stage `formalize` (with `runId` and `stage`) is no start, so the board never asks this for it.
 */
export function busyRefusal(run: RunView | null | undefined): string | undefined {
  if (!run || isTerminalRunState(run.state)) return undefined;
  switch (run.state) {
    case 'review':
      // Slice 2h: a run in review is an edit session (M2's Accept, Feedback and Discard are retired).
      return `An edit session on "${run.subject}" is waiting for your review: Apply or Exit it first.`;
    case 'interrupted':
      return `A Claude run on "${run.subject}" was interrupted: Resume or Stop it first.`;
    case 'waiting-for-answer':
      return `Claude is waiting for your answer on "${run.subject}": answer it, or Cancel that run first.`;
    default:
      return `Claude is already working on "${run.subject}" in this model: wait for it to finish, or Cancel it first.`;
  }
}

/** Run messages whose success the board also shows as a toast (an answer or a dismissal shows in the run panel itself). */
export const RUN_SUCCESS_NOTICES: ReadonlySet<RunRequestType> = new Set<RunRequestType>([
  'formalize',
  'retryStep',
  'submitReview',
  // Slice 2f: Apply (its toast carries Undo), Exit and Back to review.
  'endSession',
  'cancelRun',
  'resumeRun',
]);
