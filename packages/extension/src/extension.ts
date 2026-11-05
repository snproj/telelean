/**
 * telelean's VS Code extension (the thin host of docs/m1-plan.md section 2): commands, one board per model root,
 * the model workspaces behind them (runner), the board serializer, and (M2) one Claude RunManager per model root.
 * Activation is cheap: nothing reads model files, runs Lean or looks for a Claude binary until a board opens and the
 * user starts a run (D-28).
 */
import * as vscode from 'vscode';

import type { TeleleanApi } from './api';
import { TeleleanHost } from './vscode/host';

export type {
  BoardInfo,
  BoardMessageEvent,
  BoardPostEvent,
  InitializeArgs,
  OpenBoardArgs,
  OpenBoardResult,
  RefreshResult,
  RunBackendOverride,
  TeleleanApi,
} from './api';

let current: TeleleanHost | undefined;

export function activate(context: vscode.ExtensionContext): TeleleanApi {
  const log = vscode.window.createOutputChannel('telelean', { log: true });
  context.subscriptions.push(log);
  const host = new TeleleanHost(context, log);
  host.register();
  current = host;
  log.info(`telelean activated (VS Code ${vscode.version}, mode ${vscode.ExtensionMode[context.extensionMode]})`);
  return host.api();
}

/**
 * The window closes or reloads: every root's RunManager is disposed first, so an active run is persisted as
 * interrupted (a waiting question or proposal as it is) and its Claude session closed (docs/m2-plan.md section 4.6).
 * VS Code then disposes the rest (context.subscriptions).
 */
export async function deactivate(): Promise<void> {
  const host = current;
  current = undefined;
  await host?.shutdown();
}
