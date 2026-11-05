/**
 * Shared helpers of the in-VS-Code smoke suites: the extension's API, waiting for messages and conditions, and the
 * paths of the scratch workspace scripts/smoke.mjs prepared (ws/mental_model, ws/second_model, ws/plain_folder,
 * ws/empty_folder).
 */
import type { HostToWebviewMessage, WebviewToHostMessage } from '@telelean/core';
import * as assert from 'node:assert/strict';
import * as path from 'node:path';
import * as vscode from 'vscode';

import type { BoardPostEvent, TeleleanApi } from '../../src/api';

export const EXTENSION_ID = 'telelean.telelean';
export const BOARD_VIEW_TYPE = 'telelean.board';

export async function getApi(): Promise<TeleleanApi> {
  const extension = vscode.extensions.getExtension<TeleleanApi>(EXTENSION_ID);
  assert.ok(extension, `${EXTENSION_ID} is not loaded`);
  return extension.activate();
}

/** The scratch workspace folder (ws/) and its model roots. */
export function workspacePaths() {
  const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  assert.ok(folder, 'the smoke test needs the scratch workspace folder');
  return {
    ws: folder,
    mental: path.join(folder, 'mental_model'),
    second: path.join(folder, 'second_model'),
    plain: path.join(folder, 'plain_folder'),
    empty: path.join(folder, 'empty_folder'),
  };
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Resolves with the first event the subscription delivers that matches; rejects after `timeoutMs`. */
function nextEvent<T>(subscribe: (listener: (event: T) => void) => vscode.Disposable, predicate: (event: T) => boolean, timeoutMs: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      subscription.dispose();
      reject(new Error(`timed out after ${timeoutMs} ms waiting for ${label}`));
    }, timeoutMs);
    const subscription = subscribe((event) => {
      if (!predicate(event)) return;
      clearTimeout(timer);
      subscription.dispose();
      resolve(event);
    });
  });
}

/** The next message any board webview sends that matches. */
export function nextMessage(api: TeleleanApi, predicate: (message: WebviewToHostMessage) => boolean, timeoutMs: number, label: string): Promise<WebviewToHostMessage> {
  return nextEvent((listener) => api.onDidReceiveBoardMessage(listener), predicate, timeoutMs, `the webview to post ${label}`);
}

/** The next message the board of `root` (undefined: the sample board) sends that matches. */
export function nextBoardMessage(
  api: TeleleanApi,
  root: string | undefined,
  predicate: (message: WebviewToHostMessage) => boolean,
  timeoutMs: number,
  label: string,
): Promise<WebviewToHostMessage> {
  return nextEvent(
    (listener: (event: { root: string | undefined; message: WebviewToHostMessage }) => void) => api.onDidReceiveBoardEvent(listener),
    (event) => event.root === root && predicate(event.message),
    timeoutMs,
    `the board of ${root ?? 'the sample'} to post ${label}`,
  ).then((event) => event.message);
}

/** The next message the host posts to a board that matches. */
export function nextPost(api: TeleleanApi, predicate: (event: BoardPostEvent) => boolean, timeoutMs: number, label: string): Promise<BoardPostEvent> {
  return nextEvent((listener) => api.onDidPostToBoard(listener), predicate, timeoutMs, `the host to post ${label}`);
}

/** Records every host post (for assertions after the fact). */
export function recordPosts(api: TeleleanApi): { posts: BoardPostEvent[]; dispose(): void } {
  const posts: BoardPostEvent[] = [];
  const subscription = api.onDidPostToBoard((event) => posts.push(event));
  return { posts, dispose: () => subscription.dispose() };
}

export function postsOf<T extends HostToWebviewMessage['type']>(posts: BoardPostEvent[], type: T, root?: string): Array<Extract<HostToWebviewMessage, { type: T }>> {
  return posts
    .filter((p) => (root === undefined || p.root === root) && p.message.type === type)
    .map((p) => p.message as Extract<HostToWebviewMessage, { type: T }>);
}

export async function waitFor(condition: () => boolean | Promise<boolean>, timeoutMs: number, label: string, intervalMs = 100): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await condition()) return;
    if (Date.now() > deadline) throw new Error(`timed out after ${timeoutMs} ms waiting for ${label}`);
    await sleep(intervalMs);
  }
}

export const isRendered = (m: WebviewToHostMessage) => m.type === 'diagnostic' && m.payload.code === 'rendered';

export function message(type: string, payload: Record<string, unknown> = {}): { v: 1; type: string; payload: Record<string, unknown> } {
  return { v: 1, type, payload };
}

export async function closeAllEditors(): Promise<void> {
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');
}

/**
 * Closes every editor and waits until the workbench shows no tab (plus a short pause), so a board opened next is
 * created into a settled editor area. Opening a board while a previous "close all editors" was still being processed
 * left its webview unloaded (no "ready") in VS Code 1.140.
 */
export async function settleEditors(timeoutMs = 5_000): Promise<void> {
  await closeAllEditors();
  await waitFor(() => vscode.window.tabGroups.all.every((group) => group.tabs.length === 0), timeoutMs, 'every editor tab to close');
  await sleep(300);
}

/** Closes text and diff editors but keeps webview tabs (the boards) open. */
export async function closeTextEditors(): Promise<void> {
  const tabs = vscode.window.tabGroups.all.flatMap((group) => group.tabs).filter((tab) => !(tab.input instanceof vscode.TabInputWebview));
  if (tabs.length > 0) await vscode.window.tabGroups.close(tabs);
}
