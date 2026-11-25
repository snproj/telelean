/**
 * What `activate` returns: tests (and later integrations) observe the boards through it. The `testing` member exists
 * only when VS Code runs the extension in Test mode (the @vscode/test-cli smoke test).
 */
import type { HostToWebviewMessage, WebviewToHostMessage } from '@telelean/core';
import type { RunManager } from '@telelean/runner/run/types.js';
import type { ModelWorkspace } from '@telelean/runner/workspace/index.js';
import type * as vscode from 'vscode';

import type { BoardRecord } from './logic/restore';
import type { RunBackendOverride } from './logic/runs';
import type { RunnerFunctions } from './vscode/runner';

export type { RunBackendOverride } from './logic/runs';

export interface BoardMessageEvent {
  /** The board's model root; undefined for the sample board. */
  root: string | undefined;
  message: WebviewToHostMessage;
}

/** A message the host posted to a board webview, reported once VS Code says whether it arrived. */
export interface BoardPostEvent {
  root: string | undefined;
  message: HostToWebviewMessage;
  /** False when the board was closed (or its webview replaced) before the message arrived. */
  delivered: boolean;
  /**
   * The panel the message was posted to. VS Code reports delivery some milliseconds after the post, so an event can arrive
   * after that board was closed (and after a restored board took its place): a test tells the boards apart by this.
   */
  panel: vscode.WebviewPanel;
}

export interface BoardInfo {
  root: string | undefined;
  panel: vscode.WebviewPanel;
  /** The subject the board shows (undefined for the sample or while the model loads). */
  subject: string | undefined;
  /** True for the static sample board. */
  sample: boolean;
}

/**
 * Ids of the modal questions tests can answer in advance. `claudeConsent` is M2's egress consent ("Run Claude on this
 * model?", docs/m2-plan.md section 8.2); a yes is remembered per model root like the user's.
 */
export type PromptId = 'initGit' | 'initializeGit' | 'initializeLakeProject' | 'claudeConsent';

export interface TeleleanTesting {
  /** Replaces runner functions (e.g. with a fake ModelWorkspace); returns a function that restores them. */
  useRunner(overrides: Partial<RunnerFunctions>): () => void;
  /** Answers the given modal questions without showing them (until cleared with `undefined`). */
  answerPrompts(answers: Partial<Record<PromptId, boolean | undefined>>): void;
  /**
   * M2: the only way a Claude run gets a backend in Test mode (FakeBackend scripts): real Claude is disabled there.
   * Read when a RunManager asks for its backend (the first start of that root's RunManager that passed preflight).
   * Returns a function that restores the previous one.
   */
  useRunBackend(factory: RunBackendOverride): () => void;
  /**
   * M2: closes the root's board and disposes its model workspace and RunManager, as a window reload would (an active
   * run is persisted; a later board on the root recovers it).
   */
  disposeWorkspace(root: string): Promise<void>;
  /**
   * Closes every board, disposes every model workspace and run manager, and forgets the consent of each model folder it
   * reset (2k2: its `.telelean/runs/consent.json`), a clean slate.
   */
  reset(): Promise<void>;
}

export interface TeleleanApi {
  /** Every validated message any board webview sends (M0). */
  readonly onDidReceiveBoardMessage: vscode.Event<WebviewToHostMessage>;
  /** The same, with the board it came from. */
  readonly onDidReceiveBoardEvent: vscode.Event<BoardMessageEvent>;
  /** Every message the host posts to a board webview, once VS Code reports its delivery (a loading webview: later). */
  readonly onDidPostToBoard: vscode.Event<BoardPostEvent>;
  /** The most recently opened board panel (model or sample), if it is still open. */
  readonly boardPanel: vscode.WebviewPanel | undefined;
  boards(): BoardInfo[];
  boardFor(root: string): BoardInfo | undefined;
  /** Runs `raw` through the same validation and dispatch as a message from that root's board webview. */
  simulateBoardMessage(root: string, raw: unknown): Promise<void>;
  /** The root's model workspace, once a board has created it (it lives until the window closes). */
  workspaceFor(root: string): ModelWorkspace | undefined;
  /** M2: the root's RunManager (created with its workspace), if runs are available there. */
  runsFor(root: string): RunManager | undefined;
  /**
   * The serializer's restore path (VS Code calls it after a reload; tests pass a panel they created). Resolves once
   * the panel shows the board, before its model session is attached (`boardFor(root).subject` is set then).
   */
  restoreBoard(panel: vscode.WebviewPanel, state: unknown): Promise<void>;
  /** What the host remembers for restoring boards (newest first). */
  boardRecords(): BoardRecord[];
  readonly testing?: TeleleanTesting;
}

/** Arguments of `telelean.openBoard` (all optional; the palette passes none). */
export interface OpenBoardArgs {
  /** Open this model root directly (must hold `.telelean/config.json`). */
  root?: string;
  /** Show this subject. */
  subject?: string;
  /** Answer for the root quick pick when there are several roots (an absolute path or a folder name). */
  pick?: string;
  /** Show a static sample graph instead of a model (M0 prototype; tests). */
  sample?: 'spyro' | 'spyro-proved' | 'large';
  /** When there is no model root: answer the "Initialize one?" offer (true runs Initialize, false does nothing). */
  offerInitialize?: boolean;
}

export interface OpenBoardResult {
  root?: string;
  /** True when several roots made the command ask which one. */
  asked: boolean;
  sample?: string;
  error?: string;
}

/** Arguments of `telelean.initializeModel` beyond the explorer's folder (tests answer the prompts with them). */
export interface InitializeArgs {
  folder?: string;
  /** Answer for the first-subject input box (empty folders). */
  subject?: string;
  /** Answer for "Add telelean to this Lake project?". */
  confirm?: boolean;
  /** Answer for the git offer. */
  gitInit?: boolean;
  /** Open the board afterwards (default true). */
  openBoard?: boolean;
}

export interface RefreshResult {
  root?: string;
  state?: string;
  error?: string;
}
