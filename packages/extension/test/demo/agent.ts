/**
 * The dry run's agent inside VS Code (scripts/demo-driver.mjs --dry-run; docs/DEMO.md). The driver bundles this file
 * (esbuild, CommonJS, `vscode` external) into its work dir and starts VS Code with `--extensionTestsPath` pointing at
 * the bundle, so the extension runs in Test mode: the only mode in which a run gets a backend that is not the real
 * Claude Code (`testing.useRunBackend`). The agent does exactly the three things the driver cannot do through the UI
 * in Test mode, and nothing else:
 *
 *   1. installs the dry-run Claude (test/demo/demoClaude.ts) as the run backend;
 *   2. answers the modal questions in advance that Test mode never shows (git for the new folder, and the consent
 *      "Run Claude on this model?", which the live driver clicks in the dialog);
 *   3. runs "telelean: Initialize Model Here" with the folder and subject as arguments (in Test mode the command has no
 *      folder picker or input box, so the palette cannot drive it).
 *
 * Everything else (typing the cards, selecting, These suffice, answering, the review, Accept) the driver does through
 * the real board over the DevTools protocol, as in a live run. The agent then waits until the driver writes the stop
 * file (or the deadline passes), writes what the dry-run Claude did into its state file, and returns: VS Code then
 * closes (end of the "test run").
 *
 * Configuration: the JSON file named by TELELEAN_DEMO_AGENT ({ folder, subject, stateFile, stopFile, deadline }).
 * It refuses to run without the quota tripwire (TELELEAN_NO_REAL_CLAUDE=1) or outside Test mode.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import * as vscode from 'vscode';

import type { InitializeArgs, TeleleanApi } from '../../src/api';
import { DemoClaude } from './demoClaude';

interface AgentConfig {
  folder: string;
  subject: string;
  stateFile: string;
  stopFile: string;
  /** Epoch ms after which the agent returns anyway. */
  deadline: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function run(): Promise<void> {
  const configFile = process.env.TELELEAN_DEMO_AGENT;
  if (!configFile) throw new Error('TELELEAN_DEMO_AGENT is not set: this module is the demo driver\'s agent (scripts/demo-driver.mjs --dry-run)');
  const config = JSON.parse(readFileSync(configFile, 'utf8')) as AgentConfig;
  const log: string[] = [];
  const state: Record<string, unknown> = { phase: 'starting', log };
  const write = (patch: Record<string, unknown>) => {
    Object.assign(state, patch, { at: new Date().toISOString() });
    writeFileSync(config.stateFile, `${JSON.stringify(state, null, 2)}\n`);
  };
  const claude = new DemoClaude((message) => {
    log.push(message);
    write({});
  });
  try {
    if (process.env.TELELEAN_NO_REAL_CLAUDE !== '1') throw new Error('the dry run needs TELELEAN_NO_REAL_CLAUDE=1 in VS Code\'s environment');
    const extension = vscode.extensions.getExtension<TeleleanApi>('telelean.telelean');
    if (!extension) throw new Error('telelean.telelean is not loaded (--extensionDevelopmentPath?)');
    const api = await extension.activate();
    if (!api.testing) throw new Error('the testing API is missing: VS Code does not run the extension in Test mode');
    api.testing.useRunBackend(() => claude);
    api.testing.answerPrompts({ claudeConsent: true, initializeGit: true, initGit: true });
    write({ phase: 'ready', vscodeVersion: vscode.version });
    const args: InitializeArgs = { folder: config.folder, subject: config.subject, gitInit: true, openBoard: true };
    const initialize = await vscode.commands.executeCommand('telelean.initializeModel', args);
    write({ phase: 'initialized', initialize });
  } catch (error) {
    write({ phase: 'error', error: error instanceof Error ? (error.stack ?? error.message) : String(error) });
  }
  while (!existsSync(config.stopFile) && Date.now() < config.deadline) await sleep(500);
  write({ phase: 'stopped', stoppedBy: existsSync(config.stopFile) ? 'driver' : 'deadline', dryRunClaude: claude.runs });
}
