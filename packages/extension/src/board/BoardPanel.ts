/**
 * The board's editor tab (D-22): a WebviewPanel showing one model root's board, or the static sample graph (the M0
 * prototype, kept for tests and as the fallback of a build without model workspaces).
 *
 * The panel validates everything the webview sends with core's `parseWebviewToHost` (the webview renders workspace
 * text, so its messages are untrusted) and hands it to the root's BoardSession. Messages that arrive while the
 * model workspace is still loading are kept and handled, in order, once the session is attached.
 */
import {
  hostMessage,
  largeGraph,
  parseWebviewToHost,
  spyroGraph,
  spyroProvedGraph,
  type HostToWebviewMessage,
  type NoticeLevel,
  type TlGraph,
  type WebviewToHostMessage,
} from '@telelean/core';
import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';

import type { BoardSession } from '../logic/boardSession';
import { renderBoardHtml } from './html';

/** The static sample graphs (M0); `openBoard({ sample })` shows one. */
export type SampleName = 'spyro' | 'spyro-proved' | 'large';
export const SAMPLE_NAMES: readonly SampleName[] = ['spyro', 'spyro-proved', 'large'];

export function sampleGraph(name: SampleName): TlGraph {
  switch (name) {
    case 'spyro':
      return spyroGraph();
    case 'spyro-proved':
      return spyroProvedGraph();
    case 'large':
      return largeGraph();
  }
}

export interface BoardPanelDeps {
  extensionUri: vscode.Uri;
  log: vscode.LogOutputChannel;
  /** Every validated message (the TeleleanApi events). `root` is undefined for the sample board. */
  onMessage(root: string | undefined, message: WebviewToHostMessage): void;
  /** Every message posted to a webview. */
  onPost(root: string | undefined, message: HostToWebviewMessage, delivered: boolean): void;
}

type Mode =
  | { kind: 'loading'; queued: WebviewToHostMessage[] }
  | { kind: 'session'; session: BoardSession }
  | { kind: 'sample'; graph: TlGraph; notice?: { level: NoticeLevel; text: string } }
  | { kind: 'failed'; text: string };

const SAMPLE_ACTION_NOTICE = 'This is the static sample board: open a model folder\'s board ("telelean: Open Board") to edit.';

export class BoardPanel implements vscode.Disposable {
  static readonly viewType = 'telelean.board';

  private mode: Mode = { kind: 'loading', queued: [] };
  private readonly disposables: vscode.Disposable[] = [];
  private readonly disposeEmitter = new vscode.EventEmitter<void>();
  private disposed = false;
  private notices = 0;
  /** Fired once when the panel closes (or the board is disposed). */
  readonly onDidDispose = this.disposeEmitter.event;

  /** A new editor tab for a board. */
  static createPanel(title: string, extensionUri: vscode.Uri): vscode.WebviewPanel {
    return vscode.window.createWebviewPanel(BoardPanel.viewType, title, vscode.ViewColumn.Active, {
      ...BoardPanel.webviewOptions(extensionUri),
      enableFindWidget: true,
      retainContextWhenHidden: true,
    });
  }

  static webviewOptions(extensionUri: vscode.Uri): vscode.WebviewOptions {
    return {
      enableScripts: true,
      enableCommandUris: false,
      localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist', 'webview')],
    };
  }

  /**
   * Wraps a panel (new, or restored by the serializer) and loads the board into it. `root` is the model root, or
   * undefined for the sample board.
   */
  constructor(
    readonly panel: vscode.WebviewPanel,
    private readonly deps: BoardPanelDeps,
    readonly root: string | undefined,
  ) {
    const { webview } = panel;
    const webviewRoot = vscode.Uri.joinPath(deps.extensionUri, 'dist', 'webview');
    webview.options = BoardPanel.webviewOptions(deps.extensionUri);
    webview.html = renderBoardHtml({
      cspSource: webview.cspSource,
      nonce: randomBytes(18).toString('base64'),
      bootUri: webview.asWebviewUri(vscode.Uri.joinPath(webviewRoot, 'boot.js')).toString(),
      scriptUri: webview.asWebviewUri(vscode.Uri.joinPath(webviewRoot, 'webview.js')).toString(),
      styleUri: webview.asWebviewUri(vscode.Uri.joinPath(webviewRoot, 'webview.css')).toString(),
    });
    this.disposables.push(
      webview.onDidReceiveMessage((raw: unknown) => void this.receive(raw)),
      panel.onDidDispose(() => this.dispose()),
    );
    deps.log.info(`board opened: ${root ?? 'sample'} ("${panel.title}")`);
  }

  get session(): BoardSession | undefined {
    return this.mode.kind === 'session' ? this.mode.session : undefined;
  }

  get isSample(): boolean {
    return this.mode.kind === 'sample';
  }

  /** The model could not be loaded (Open Board then creates the board again, i.e. retries). */
  get isFailed(): boolean {
    return this.mode.kind === 'failed';
  }

  /** Attaches the model session and replays what the webview sent while the workspace loaded. */
  async attach(session: BoardSession): Promise<void> {
    const queued = this.mode.kind === 'loading' ? this.mode.queued : [];
    this.mode = { kind: 'session', session };
    await session.requestPublish(); // the webview may have said "ready" long ago, or may say it later
    // The root's run and proposal (e.g. a question restored after a reload) once its runs are recovered; not awaited,
    // so a slow recovery never holds back what the webview sent meanwhile.
    void session.publishRuns();
    for (const message of queued) if (message.type !== 'ready') await session.handle(message);
  }

  /** Shows a static sample graph (optionally with a notice, e.g. why it is not the model). */
  showSample(graph: TlGraph, notice?: { level: NoticeLevel; text: string }): void {
    this.mode = notice ? { kind: 'sample', graph, notice } : { kind: 'sample', graph };
    void this.postSample();
  }

  /** The board could not load its model: says why on every "ready". */
  fail(text: string): void {
    this.mode = { kind: 'failed', text };
    void this.postNotice('error', text);
  }

  /** Validates and handles one message from the webview (also the test API's simulated messages). */
  async receive(raw: unknown): Promise<void> {
    const parsed = parseWebviewToHost(raw);
    if (!parsed.ok) {
      this.deps.log.warn(`[webview->host] rejected message: ${parsed.error}`);
      return;
    }
    await this.handle(parsed.value);
  }

  /**
   * Hands a message to the webview and resolves at once: it never waits for the message to arrive. VS Code keeps the
   * messages for a webview that is still loading and resolves `postMessage` only once that webview is ready, and it
   * creates the webview of a panel restored after a window reload only after the serializer's
   * `deserializeWebviewPanel` has resolved. Waiting for delivery on that path waited forever (the restored board
   * stayed a blank tab). Nothing here needs delivery: a webview that is still loading says "ready" once it runs, and
   * the session then publishes again. The log and `onPost` learn whether the message arrived once VS Code says so.
   * Resolves false only when the board is closed.
   */
  post(message: HostToWebviewMessage): Promise<boolean> {
    if (this.disposed) return Promise.resolve(false);
    let delivery: Thenable<boolean>;
    try {
      delivery = this.panel.webview.postMessage(message);
    } catch {
      delivery = Promise.resolve(false);
    }
    void Promise.resolve(delivery).then(
      (delivered) => this.reportPost(message, delivered === true),
      () => this.reportPost(message, false),
    );
    return Promise.resolve(true);
  }

  reveal(): void {
    this.panel.reveal();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.session?.dispose();
    for (const disposable of this.disposables.splice(0)) disposable.dispose();
    this.panel.dispose();
    this.deps.log.info(`board closed: ${this.root ?? 'sample'}`);
    this.disposeEmitter.fire();
    this.disposeEmitter.dispose();
  }

  // ---------------------------------------------------------------------------------------------

  private reportPost(message: HostToWebviewMessage, delivered: boolean): void {
    const what = message.type === 'graph' ? `graph "${message.payload.graph.subject}" v${message.payload.graph.version}` : message.type;
    const line = `[host->webview] ${what}: ${delivered ? 'delivered' : 'not delivered (the board was closed or its webview was replaced)'}`;
    if (message.type === 'graph' || message.type === 'workspace' || message.type === 'history') this.deps.log.debug(line);
    else this.deps.log.info(`${line} ${JSON.stringify(message.payload).slice(0, 300)}`);
    this.deps.onPost(this.root, message, delivered);
  }

  private async handle(message: WebviewToHostMessage): Promise<void> {
    const line = `[webview->host] ${message.type} ${JSON.stringify(message.payload).slice(0, 500)}`;
    if (message.type === 'diagnostic' && message.payload.level === 'error') this.deps.log.error(line);
    else if (message.type === 'diagnostic' && message.payload.level === 'warn') this.deps.log.warn(line);
    else this.deps.log.info(line);
    this.deps.onMessage(this.root, message);

    switch (this.mode.kind) {
      case 'loading':
        this.mode.queued.push(message);
        return;
      case 'session':
        return this.mode.session.handle(message);
      case 'sample':
        if (message.type === 'ready') return this.postSample();
        if (message.type === 'select' || message.type === 'diagnostic' || message.type === 'copyText') {
          if (message.type === 'copyText') {
            await vscode.env.clipboard.writeText(message.payload.text);
            await this.postNotice('info', 'Copied');
          }
          return;
        }
        await this.postNotice('info', SAMPLE_ACTION_NOTICE);
        return;
      case 'failed':
        if (message.type === 'ready') await this.postNotice('error', this.mode.text);
        return;
    }
  }

  private async postSample(): Promise<void> {
    if (this.mode.kind !== 'sample') return;
    const { graph, notice } = this.mode;
    await this.post(hostMessage('graph', { graph }));
    if (notice) await this.postNotice(notice.level, notice.text);
  }

  private postNotice(level: NoticeLevel, text: string): Promise<boolean> {
    return this.post(hostMessage('notice', { id: `p${Date.now().toString(36)}-${++this.notices}`, level, text, undoable: false }));
  }
}
