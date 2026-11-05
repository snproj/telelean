/**
 * The Claude backend factory (amendment A1; docs/m2-plan.md section 8.4): resolves the user's own Claude Code binary
 * (setting -> newest VS Code Claude Code extension binary -> PATH -> ~/.local/bin; `--version` >= 2.1.295) and builds
 * the ClaudeCliBackend with an explicit guard script path, the hook runtime, the client app and the
 * `setpriv --pdeathsig KILL --` launcher (absolute path), so a SIGKILLed extension host takes the CLI down.
 * Contacts nothing but `claude --version`.
 */
import { accessSync, constants } from 'node:fs';

import { findSystemExecutable } from '../lean/systemd.js';
import { resolveClaudeBinary, type ResolveBinaryOptions, type ResolvedBinary } from '../llm/binary.js';
import { ClaudeCliBackend, NO_REAL_CLAUDE_ENV, realClaudeDisabled, type ClaudeCliBackendOptions } from '../llm/claudeCli.js';
import { defaultHookRuntime } from '../llm/confinement.js';
import { LlmHarnessError } from '../llm/types.js';
import type { ClaudeBackendSettings } from './types.js';

/** The launcher prefix: `<abs setpriv> --pdeathsig KILL -- <claude> …`. */
export const PDEATHSIG_ARGS: readonly string[] = ['--pdeathsig', 'KILL', '--'];

/** The absolute path of util-linux `setpriv`, checked to be executable. */
export function setprivLauncher(): { command: string; args: string[] } {
  const command = findSystemExecutable('setpriv');
  try {
    accessSync(command, constants.X_OK);
  } catch {
    throw new LlmHarnessError('binary', `setpriv (util-linux) was not found at ${command}; telelean needs it to tie the Claude CLI to the editor's lifetime.`);
  }
  return { command, args: [...PDEATHSIG_ARGS] };
}

export async function createClaudeBackendImpl(settings: ClaudeBackendSettings): Promise<{ backend: ClaudeCliBackend; binary: ResolvedBinary }> {
  // Quota tripwire: before resolving anything (not even `--version`), unless a test supplies fake binaries through a
  // scratch home AND PATH (fixer round 1: `resolve: {}` or `{ runVersion }` alone would scan the real ~/.vscode, PATH
  // and ~/.local/bin and run their `--version`).
  if (realClaudeDisabled() && (typeof settings.resolve?.home !== 'string' || typeof settings.resolve.pathEnv !== 'string')) {
    throw new LlmHarnessError(
      'process',
      `real Claude is disabled here (${NO_REAL_CLAUDE_ENV}=${process.env[NO_REAL_CLAUDE_ENV] ?? ''}): no Claude binary was looked up or run${settings.resolve !== undefined ? ' (a test must pass both resolve.home and resolve.pathEnv)' : ''}.`,
    );
  }
  if (typeof settings.guardScriptPath !== 'string' || settings.guardScriptPath === '') {
    throw new TypeError('createClaudeBackend needs the absolute path of telelean-path-guard.mjs (guardScriptPath)');
  }
  const resolveOptions: ResolveBinaryOptions = { ...(settings.resolve ?? {}) };
  if (settings.claudePath !== undefined && settings.claudePath.trim() !== '') resolveOptions.explicitPath = settings.claudePath.trim();
  if (settings.extensionDirs !== undefined) resolveOptions.extensionDirs = settings.extensionDirs;
  const binary = await resolveClaudeBinary(resolveOptions);
  const options: ClaudeCliBackendOptions = {
    binary: { path: binary.path, version: binary.version },
    guardScriptPath: settings.guardScriptPath,
    hookRuntime: settings.hookRuntime ?? defaultHookRuntime(),
    clientApp: settings.clientApp,
  };
  if (settings.pdeathsig ?? true) options.launcher = setprivLauncher();
  return { backend: new ClaudeCliBackend(options), binary };
}
