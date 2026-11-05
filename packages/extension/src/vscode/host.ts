/**
 * The extension host's controller (docs/m1-plan.md sections 2, 3 and 9 WP5): model roots, one board per root, the
 * model workspaces behind them, the three commands, the board serializer (D-22) and the test API.
 *
 *   Open Board      model roots per workspace folder (runner findModelRoots); several -> quick pick; none -> offer
 *                   Initialize; one board per root ("telelean: <folder>"), reused when it is already open
 *   Initialize      inspect -> first subject -> planInitialize -> EditApplier -> git offer -> open the board
 *   Refresh         `refreshNow` for the focused (or only) open board
 *   restore         after a reload, the serializer maps the restored panel back to its root and subject
 *
 * A folder without `.telelean/config.json` never gets a workspace, so nothing runs Lean there (D-28 opt-in).
 *
 * M2 (docs/m2-plan.md section 8): each root's RunManager lives with its workspace in the registry, with the run
 * directories under VS Code's global storage (`<globalStorage>/runs`) and a lazy Claude backend (logic/runs.ts: built
 * at the first start that passed preflight; refused in Test mode unless a test installed one). The board asks for
 * the egress consent once per root (remembered in globalState) and shows a proposal's raw Lean diff beside it.
 * Deactivation disposes the run managers first (an active run is persisted and its session closed).
 */
import { access } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';

import {
  parseWebviewToHost,
  webviewMessage,
  type HostToWebviewMessage,
  type NoticeLevel,
  type Range,
  type WebviewToHostMessage,
} from '@telelean/core';
import type { RunManager } from '@telelean/runner/run/types.js';
import { rootKeyOf } from '@telelean/runner/shadow/index.js';
import type { ModelWorkspace, WorkspaceChange } from '@telelean/runner/workspace/index.js';

import type {
  BoardInfo,
  BoardMessageEvent,
  BoardPostEvent,
  InitializeArgs,
  OpenBoardArgs,
  OpenBoardResult,
  PromptId,
  RefreshResult,
  TeleleanApi,
  TeleleanTesting,
} from '../api';
import { BoardPanel, SAMPLE_NAMES, sampleGraph, type SampleName } from '../board/BoardPanel';
import { BoardSession, type BoardSessionPorts, type ConfirmId } from '../logic/boardSession';
import { groupBesideBoard } from '../logic/groups';
import { runInitialize, subjectNameProblem, type InitializePorts, type InitializeResult } from '../logic/initialize';
import { resolveModelFile } from '../logic/modelPaths';
import { boardTitle, parseRecords, restoreTarget, updateRecords, type BoardRecord } from '../logic/restore';
import { chooseRoot, matchRoot, ROOT_SEARCH_DEPTH, rootPickItems } from '../logic/roots';
import {
  CLAUDE_EXTENSION_ID,
  claudeBackendSettings,
  CONSENT_DETAIL,
  CONSENT_KEY_PREFIX,
  CONSENT_MESSAGE,
  CONSENT_YES,
  consentKey,
  runBackendFactory,
  type RunBackendOverride,
} from '../logic/runs';
import { readSettings, type TeleleanSettings } from '../logic/settings';
import { editorGroups, vscodeEditApplier } from './editor';
import { HistoryPreviews, ProposalPreviews } from './historyProvider';
import { WorkspaceRegistry, type Log } from './registry';
import { DEFAULT_RUNNER, type RunnerFunctions } from './runner';

/** Test hooks of the constructor (unit tests run the host against test/unit/vscodeStub.ts in any extension mode). */
export interface TeleleanHostOptions {
  /** Replaces runner functions from the start (the `testing` API exists only in Test mode). */
  runner?: Partial<RunnerFunctions>;
}

const RECORDS_KEY = 'telelean.boards';
export const SAMPLE_TITLE = 'telelean: sample';
const INIT_GIT_DETAIL =
  "telelean records each change as a private ref (refs/telelean/…) in this folder's own repository. It never touches your branches, staging area or hooks, and never pushes.";

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

async function isModelRoot(root: string): Promise<boolean> {
  try {
    await access(path.join(root, '.telelean', 'config.json'));
    return true;
  } catch {
    return false;
  }
}

function toVscodeRange(range: Range): vscode.Range {
  return new vscode.Range(range.start.line, range.start.character, range.end.line, range.end.character);
}

export class TeleleanHost implements vscode.Disposable {
  private runner: RunnerFunctions;
  private readonly boards = new Map<string, BoardPanel>();
  private readonly orphans = new Set<BoardPanel>();
  private sample: BoardPanel | undefined;
  private lastPanel: BoardPanel | undefined;
  private readonly registry: WorkspaceRegistry;
  private readonly previews = new HistoryPreviews();
  private readonly proposalPreviews = new ProposalPreviews();
  private readonly messages = new vscode.EventEmitter<WebviewToHostMessage>();
  private readonly events = new vscode.EventEmitter<BoardMessageEvent>();
  private readonly posts = new vscode.EventEmitter<BoardPostEvent>();
  private readonly readyBoards = new WeakMap<BoardPanel, Promise<void>>();
  private promptAnswers: Partial<Record<PromptId, boolean>> = {};
  /** Test mode only: the backend `testing.useRunBackend` installed (real Claude is disabled in Test mode). */
  private runBackend: RunBackendOverride | undefined;
  private readonly isTest: boolean;
  private readonly version: string;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly log: vscode.LogOutputChannel,
    options: TeleleanHostOptions = {},
  ) {
    this.isTest = context.extensionMode === vscode.ExtensionMode.Test;
    this.runner = { ...DEFAULT_RUNNER, ...options.runner };
    this.version = String((context.extension.packageJSON as { version?: unknown }).version ?? '0.0.0');
    this.registry = new WorkspaceRegistry({
      runner: () => this.runner,
      settingsFor: (root) => this.settingsFor(root),
      generatorVersion: this.version,
      log: this.logAt,
      isBoardOpen: (root) => this.boards.get(root)?.session !== undefined,
      onDidChange: (root, change) => this.onWorkspaceChange(root, change),
      createRunManager: (root, workspace) => this.createRunManager(root, workspace),
    });
  }

  /** Registers the commands, the serializer and the history document provider. */
  register(): void {
    this.context.subscriptions.push(
      this,
      vscode.commands.registerCommand('telelean.openBoard', (args?: OpenBoardArgs) => this.openBoardCommand(args)),
      vscode.commands.registerCommand('telelean.initializeModel', (arg?: vscode.Uri | InitializeArgs) => this.initializeCommand(arg)),
      vscode.commands.registerCommand('telelean.refresh', () => this.refreshCommand()),
      vscode.window.registerWebviewPanelSerializer(BoardPanel.viewType, {
        deserializeWebviewPanel: (panel, state) => this.restoreBoard(panel, state),
      }),
    );
  }

  // ---------------------------------------------------------------------------------------------
  // Commands

  async openBoardCommand(args?: OpenBoardArgs): Promise<OpenBoardResult> {
    if (args?.sample) {
      const name = SAMPLE_NAMES.includes(args.sample) ? args.sample : 'spyro';
      this.showSample(name);
      return { asked: false, sample: name };
    }
    if (args?.root) {
      const root = path.resolve(args.root);
      if (!(await isModelRoot(root))) {
        const error = `"${root}" is not a telelean model (no .telelean/config.json): run "telelean: Initialize Model Here" first.`;
        void vscode.window.showErrorMessage(error);
        return { asked: false, error };
      }
      await this.openBoard(root, args.subject);
      return { root, asked: false };
    }

    let roots: string[];
    try {
      roots = await this.findRoots();
    } catch (error) {
      void vscode.window.showErrorMessage(`telelean could not look for model folders: ${errorText(error)}`);
      return { asked: false, error: errorText(error) };
    }

    const choice = chooseRoot(roots);
    switch (choice.kind) {
      case 'none': {
        const error = 'There is no telelean model in this window.';
        if (args?.offerInitialize === true) {
          await vscode.commands.executeCommand('telelean.initializeModel');
        } else if (args?.offerInitialize === undefined && !this.isTest) {
          const initialize = 'Initialize Model Here…';
          void vscode.window.showInformationMessage(`${error} Initialize one?`, initialize).then((picked) => {
            if (picked === initialize) void vscode.commands.executeCommand('telelean.initializeModel');
          });
        }
        return { asked: false, error };
      }
      case 'single':
        await this.openBoard(choice.root, args?.subject);
        return { root: choice.root, asked: false };
      case 'ask': {
        if (args?.pick === undefined && this.isTest) return { asked: true, error: 'several model roots: the test must pass "pick"' };
        const root = args?.pick !== undefined ? matchRoot(choice.roots, args.pick) : await this.pickRoot(choice.roots);
        if (!root) return { asked: true, error: args?.pick !== undefined ? `no model root matches "${args.pick}"` : 'cancelled' };
        await this.openBoard(root, args?.subject);
        return { root, asked: true };
      }
    }
  }

  async initializeCommand(arg?: vscode.Uri | InitializeArgs): Promise<InitializeResult | undefined> {
    const args: InitializeArgs = arg instanceof vscode.Uri ? { folder: arg.fsPath } : (arg ?? {});
    const folder = args.folder ? path.resolve(args.folder) : await this.pickFolderToInitialize();
    if (!folder) return undefined;
    const ports: InitializePorts = {
      inspect: (f) => this.runner.inspectFolder(f),
      askSubject: async (f, suggested) => {
        if (args.subject !== undefined) return args.subject;
        if (this.isTest) return undefined;
        return vscode.window.showInputBox({
          title: `telelean: Initialize Model Here (${path.basename(f)})`,
          prompt: 'Name of the first subject: a Lean namespace and module name, e.g. Spyro',
          value: suggested,
          ignoreFocusOut: true,
          validateInput: (value) => subjectNameProblem(value),
        });
      },
      confirmLakeProject: async (f, library, subjects) =>
        args.confirm ??
        this.confirm(
          'initializeLakeProject',
          `Add telelean to the Lake project "${path.basename(f)}"?`,
          `This creates .telelean/config.json (library ${library}) and a layout file for each subject (${subjects.join(', ') || 'none yet'}), and adds telelean's lines to .gitignore. Your Lean files are not changed.`,
          'Add telelean',
        ),
      plan: (options) => this.runner.planInitialize(options),
      apply: (f, changes) => vscodeEditApplier(f, this.logAt).apply(changes, 'Initialize model'),
      historyStatus: async (f) => (await this.registry.get(f)).historyStatus(),
      offerGitInit: async (f) =>
        args.gitInit ?? this.confirm('initializeGit', `Initialize a git repository in "${path.basename(f)}" for telelean's history?`, INIT_GIT_DETAIL, 'Initialize git'),
      initGit: async (f) => (await this.registry.get(f)).initGit(),
      openBoard: async (f) => {
        await this.openBoard(f);
      },
      show: (level, text) => {
        if (level === 'error') void vscode.window.showErrorMessage(text);
        else if (level === 'warn') void vscode.window.showWarningMessage(text);
        else void vscode.window.showInformationMessage(text);
      },
    };
    const result = await runInitialize(folder, ports, { openBoard: args.openBoard ?? true });
    this.log.info(`initialize ${folder}: ${JSON.stringify(result)}`);
    return result;
  }

  async refreshCommand(): Promise<RefreshResult> {
    const open = [...this.boards.values()].filter((board) => board.session);
    let board = open.find((b) => b.panel.active) ?? (open.length === 1 ? open[0] : undefined);
    if (!board && open.length > 1) {
      if (this.isTest) return { error: 'several boards are open and none is focused' };
      const picked = await vscode.window.showQuickPick(
        open.map((b) => ({ label: b.panel.title, board: b })),
        { title: 'telelean: Refresh Lean Check', placeHolder: 'Which board?' },
      );
      board = picked?.board;
      if (!board) return { error: 'cancelled' };
    }
    if (!board?.session) {
      const opened = await this.openBoardCommand();
      return opened.root ? { root: opened.root, state: 'opened' } : { error: opened.error ?? 'no board' };
    }
    const { session } = board;
    try {
      const summary = await session.workspace.refreshNow();
      await session.requestPublish();
      return { root: session.root, state: summary.state };
    } catch (error) {
      void vscode.window.showWarningMessage(`telelean: the Lean refresh failed: ${errorText(error)}`);
      return { root: session.root, error: errorText(error) };
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Boards

  /** Opens (or reveals) the board of a model root; resolves once its model session is attached (or failed). */
  async openBoard(root: string, subject?: string): Promise<BoardPanel> {
    const { board, ready } = this.showBoard(root, subject);
    await ready;
    return board;
  }

  /**
   * Shows the board of a model root at once (a new tab, the existing one, or `restored`, a panel the serializer hands
   * back after a reload) and starts attaching its model session; `ready` settles when the session is attached, the
   * board failed, or the subject switch is done. The webview's own messages wait in the panel until then.
   */
  private showBoard(root: string, subject?: string, restored?: vscode.WebviewPanel): { board: BoardPanel; ready: Promise<void> } {
    const failed = this.boards.get(root);
    if (failed?.isFailed) failed.dispose(); // retry: the model may load now
    const existing = this.boards.get(root);
    if (existing) {
      if (restored && restored !== existing.panel) restored.dispose();
      existing.reveal();
      this.lastPanel = existing;
      const ready = (async () => {
        await this.readyBoards.get(existing);
        if (subject && existing.session && existing.session.subject !== subject) {
          await existing.session.handle(webviewMessage('selectSubject', { subject }));
        }
      })().catch((error: unknown) => this.log.error(`showing the board of ${root} failed: ${errorText(error)}`));
      return { board: existing, ready };
    }

    const records = this.records();
    const title = boardTitle(root, [...this.boards.keys(), ...records.map((r) => r.root)]);
    const panel = restored ?? BoardPanel.createPanel(title, this.context.extensionUri);
    if (restored) panel.title = title;
    const board = new BoardPanel(panel, this.panelDeps(), root);
    this.boards.set(root, board);
    this.lastPanel = board;
    board.onDidDispose(() => {
      if (this.boards.get(root) === board) this.boards.delete(root);
    });
    const wanted = subject ?? records.find((r) => r.root === root)?.subject;
    this.saveRecord(wanted ? { root, title, subject: wanted } : { root, title });

    const ready = this.attachSession(board, root, wanted).catch((error: unknown) => {
      const text = `telelean could not open the board of "${path.basename(root)}": ${errorText(error)}`;
      this.log.error(text);
      board.fail(text);
    });
    this.readyBoards.set(board, ready);
    return { board, ready };
  }

  private async attachSession(board: BoardPanel, root: string, subject: string | undefined): Promise<void> {
    let workspace: ModelWorkspace;
    try {
      workspace = await this.registry.get(root);
    } catch (error) {
      const text = `telelean could not load the model in "${path.basename(root)}": ${errorText(error)}`;
      board.fail(text);
      void vscode.window.showErrorMessage(text);
      return;
    }
    if (this.boards.get(root) !== board) return; // closed while the workspace loaded
    const runs = this.registry.runs(root);
    const session = new BoardSession({
      root,
      rootName: path.basename(root),
      workspace,
      ...(subject ? { subject } : {}),
      ports: this.sessionPorts(root, board),
      ...(runs ? { runs } : {}),
    });
    await board.attach(session);
    workspace.requestRefresh('open');
  }

  /**
   * The serializer's path: maps a restored panel back to its model root and subject (D-22). Resolves as soon as the
   * panel holds the board's HTML, without waiting for the model session: VS Code creates a restored panel's webview
   * only after `deserializeWebviewPanel` resolves, so anything here that waited for the webview (the session's first
   * messages) would keep the tab blank forever. The session attaches in the background; the webview's "ready" waits
   * in the panel until it is attached.
   */
  async restoreBoard(panel: vscode.WebviewPanel, state: unknown): Promise<void> {
    if (panel.title === SAMPLE_TITLE) {
      this.showSample('spyro', undefined, panel);
      return;
    }
    let roots: string[] = [];
    try {
      roots = await this.findRoots();
    } catch (error) {
      this.log.warn(`restore: could not list model roots: ${errorText(error)}`);
    }
    const target = restoreTarget({ state, title: panel.title, roots, records: this.records() });
    if (target && (await isModelRoot(target.root))) {
      this.log.info(`restoring board "${panel.title}" -> ${target.root} (${target.subject ?? 'first subject'})`);
      this.showBoard(target.root, target.subject, panel); // its `ready` is deliberately not awaited (see above)
      return;
    }
    const orphan = new BoardPanel(panel, this.panelDeps(), undefined);
    this.orphans.add(orphan);
    orphan.onDidDispose(() => this.orphans.delete(orphan));
    orphan.fail(`telelean could not find the model folder of this board ("${panel.title}"). Close this tab and run "telelean: Open Board".`);
  }

  private showSample(name: SampleName, notice?: { level: NoticeLevel; text: string }, restored?: vscode.WebviewPanel): BoardPanel {
    let board = this.sample;
    if (board && restored && restored !== board.panel) restored.dispose();
    if (!board) {
      const panel = restored ?? BoardPanel.createPanel(SAMPLE_TITLE, this.context.extensionUri);
      board = new BoardPanel(panel, this.panelDeps(), undefined);
      this.sample = board;
      const created = board;
      created.onDidDispose(() => {
        if (this.sample === created) this.sample = undefined;
      });
    } else {
      board.reveal();
    }
    board.showSample(sampleGraph(name), notice);
    this.readyBoards.set(board, Promise.resolve());
    this.lastPanel = board;
    return board;
  }

  private panelDeps() {
    return {
      extensionUri: this.context.extensionUri,
      log: this.log,
      onMessage: (root: string | undefined, message: WebviewToHostMessage) => {
        this.messages.fire(message);
        this.events.fire({ root, message });
      },
      onPost: (root: string | undefined, message: HostToWebviewMessage, delivered: boolean) => this.posts.fire({ root, message, delivered }),
    };
  }

  private sessionPorts(root: string, board: BoardPanel): BoardSessionPorts {
    return {
      post: (message) => board.post(message),
      writeClipboard: async (text) => {
        await vscode.env.clipboard.writeText(text);
      },
      resolveFile: (file) => resolveModelFile(root, file),
      openFile: async (absPath, range) => {
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(absPath));
        // Beside the board, never over it: a group that shows the file already, else another group; only when the
        // board's group is the only one does VS Code split it (ViewColumn.Beside).
        const column = groupBesideBoard(editorGroups(), board.panel.viewColumn, absPath);
        await vscode.window.showTextDocument(doc, {
          viewColumn: column ?? vscode.ViewColumn.Beside,
          preview: false,
          ...(range ? { selection: toVscodeRange(range) } : {}),
        });
      },
      showHistoryDiff: async (diff) => {
        await this.previews.show(diff, root, board.panel.viewColumn);
      },
      confirm: (id, message, detail, yes) => this.confirm(id, message, detail, yes),
      subjectChanged: (subject) => this.saveRecord({ root, title: board.panel.title, subject }),
      log: (level, message) => this.logAt(level, `[${path.basename(root)}] ${message}`),
      claudeConsent: () => this.claudeConsent(root),
      showProposalDiff: async (diff) => {
        await this.proposalPreviews.show(diff, root, board.panel.viewColumn);
      },
    };
  }

  private onWorkspaceChange(root: string, change: WorkspaceChange): void {
    void this.boards.get(root)?.session?.onWorkspaceChange(change);
  }

  // ---------------------------------------------------------------------------------------------
  // M2: Claude runs

  /**
   * The root's RunManager (the registry calls this once the root's workspace has loaded). Its backend is a factory the
   * RunManager calls at the first start that passed preflight, never here: opening a board never resolves or runs a
   * Claude binary. Throws when runs are unavailable (no storage folder, or the runner's run functions are missing).
   */
  private createRunManager(root: string, workspace: ModelWorkspace): RunManager {
    const storage = (this.context.globalStorageUri as vscode.Uri | undefined)?.fsPath;
    if (!storage) throw new Error('VS Code gave telelean no global storage folder for its run directories');
    const runner = this.runner;
    const name = path.basename(root);
    const log: Log = (level, message) => this.logAt(level, `[${name}] ${message}`);
    return runner.createRunManager({
      root,
      runsDir: path.join(storage, 'runs'),
      workspace,
      settings: this.settingsFor(root).run,
      services: {
        backend: runBackendFactory({
          root,
          isTest: this.isTest,
          override: () => this.runBackend,
          settings: () =>
            claudeBackendSettings({
              extensionRoot: this.context.extensionUri.fsPath,
              version: this.version,
              claudePath: this.settingsFor(root).claudePath,
              claudeExtensionPath: vscode.extensions.getExtension(CLAUDE_EXTENSION_ID)?.extensionPath,
              home: os.homedir(),
              hookRuntime: this.runner.defaultHookRuntime(),
            }),
          createClaudeBackend: (settings) => this.runner.createClaudeBackend(settings),
          log,
        }),
        engine: runner.createLeanCheckEngine(),
        proposals: runner.createProposalService(),
        sidecars: runner.createRunSidecarStore(),
        log: (level, message) => log(level, `run: ${message}`),
      },
    });
  }

  /**
   * Egress consent (docs/m2-plan.md section 8.2), once per model root: a modal naming exactly what leaves the machine;
   * a yes is remembered in globalState (`telelean.claudeConsent.<rootKey>`). A no starts nothing and is not
   * remembered, so the next start asks again. In Test mode the testing API answers it.
   */
  private async claudeConsent(root: string): Promise<boolean> {
    const key = consentKey(rootKeyOf(root));
    if (this.context.globalState.get<unknown>(key) === true) return true;
    const yes = await this.confirm('claudeConsent', CONSENT_MESSAGE, CONSENT_DETAIL, CONSENT_YES);
    if (yes) await this.context.globalState.update(key, true);
    this.log.info(`[${path.basename(root)}] Claude consent: ${yes ? 'allowed (remembered for this model folder)' : 'declined'}`);
    return yes;
  }

  /**
   * Deactivation (extension.ts `deactivate`): disposes every root's RunManager first, so an active run is persisted
   * as interrupted and its Claude session closed while the workspaces still exist.
   */
  async shutdown(): Promise<void> {
    await this.registry.shutdownRuns();
  }

  // ---------------------------------------------------------------------------------------------
  // Helpers

  /** Model roots in the window's (file) workspace folders. */
  private async findRoots(): Promise<string[]> {
    const folders = (vscode.workspace.workspaceFolders ?? []).filter((f) => f.uri.scheme === 'file');
    const lists = await Promise.all(folders.map((f) => this.runner.findModelRoots(f.uri.fsPath, { maxDepth: ROOT_SEARCH_DEPTH })));
    return [...new Set(lists.flat())].sort();
  }

  private async pickRoot(roots: string[]): Promise<string | undefined> {
    const folders = (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath);
    const picked = await vscode.window.showQuickPick(rootPickItems(roots, folders), {
      title: 'telelean: Open Board',
      placeHolder: 'Which model?',
    });
    return picked?.root;
  }

  private async pickFolderToInitialize(): Promise<string | undefined> {
    if (this.isTest) return undefined; // tests pass the folder
    const folders = (vscode.workspace.workspaceFolders ?? []).filter((f) => f.uri.scheme === 'file');
    if (folders.length > 0) {
      const items: Array<vscode.QuickPickItem & { folder?: string }> = [
        ...folders.map((f) => ({ label: f.name, description: f.uri.fsPath, folder: f.uri.fsPath })),
        { label: 'Choose another folder…' },
      ];
      const picked = await vscode.window.showQuickPick(items, {
        title: 'telelean: Initialize Model Here',
        placeHolder: 'Which folder should hold the model? (An empty folder, or a Lake project without dependencies.)',
      });
      if (!picked) return undefined;
      if (picked.folder) return picked.folder;
    }
    const uris = await vscode.window.showOpenDialog({
      canSelectFolders: true,
      canSelectFiles: false,
      canSelectMany: false,
      openLabel: 'Initialize Model Here',
      ...(folders[0] ? { defaultUri: folders[0].uri } : {}),
    });
    return uris?.[0]?.fsPath;
  }

  /** A modal yes/no question; tests answer in advance, and in Test mode an unanswered question counts as "no". */
  private async confirm(id: ConfirmId | PromptId, message: string, detail: string, yes: string): Promise<boolean> {
    const preset = this.promptAnswers[id];
    if (preset !== undefined) return preset;
    if (this.isTest) {
      this.log.warn(`prompt "${id}" not answered by the test: treated as "no" (${message})`);
      return false;
    }
    return (await vscode.window.showInformationMessage(message, { modal: true, detail }, yes)) === yes;
  }

  private settingsFor(root: string): TeleleanSettings {
    const config = vscode.workspace.getConfiguration('telelean', vscode.Uri.file(root));
    return readSettings((key, fallback) => config.get(key, fallback));
  }

  private records(): BoardRecord[] {
    return parseRecords(this.context.workspaceState.get<unknown>(RECORDS_KEY));
  }

  private saveRecord(record: BoardRecord): void {
    void this.context.workspaceState.update(RECORDS_KEY, updateRecords(this.records(), record));
  }

  private readonly logAt: Log = (level, message) => {
    if (level === 'error') this.log.error(message);
    else if (level === 'warn') this.log.warn(message);
    else this.log.info(message);
  };

  private info(board: BoardPanel): BoardInfo {
    return { root: board.root, panel: board.panel, subject: board.session?.subject, sample: board.isSample };
  }

  // ---------------------------------------------------------------------------------------------
  // API

  api(): TeleleanApi {
    const host = this;
    const testing: TeleleanTesting = {
      useRunner: (overrides) => {
        const previous = host.runner;
        host.runner = { ...previous, ...overrides };
        return () => {
          host.runner = previous;
        };
      },
      answerPrompts: (answers) => {
        for (const [id, answer] of Object.entries(answers) as Array<[PromptId, boolean | undefined]>) {
          if (answer === undefined) delete host.promptAnswers[id];
          else host.promptAnswers[id] = answer;
        }
      },
      useRunBackend: (factory) => {
        const previous = host.runBackend;
        host.runBackend = factory;
        return () => {
          host.runBackend = previous;
        };
      },
      disposeWorkspace: async (root) => {
        host.boards.get(root)?.dispose();
        host.registry.forget(root);
      },
      reset: async () => {
        for (const board of [...host.boards.values(), ...host.orphans, ...(host.sample ? [host.sample] : [])]) board.dispose();
        for (const root of host.registry.roots()) host.registry.forget(root);
        host.promptAnswers = {};
        host.runBackend = undefined;
        await host.context.workspaceState.update(RECORDS_KEY, undefined);
        for (const key of host.context.globalState.keys()) {
          if (key.startsWith(CONSENT_KEY_PREFIX)) await host.context.globalState.update(key, undefined);
        }
      },
    };
    return {
      onDidReceiveBoardMessage: this.messages.event,
      onDidReceiveBoardEvent: this.events.event,
      onDidPostToBoard: this.posts.event,
      get boardPanel() {
        const last = host.lastPanel;
        return last && (last === host.sample || [...host.boards.values()].includes(last)) ? last.panel : undefined;
      },
      boards: () => [...this.boards.values(), ...(this.sample ? [this.sample] : [])].map((b) => this.info(b)),
      boardFor: (root) => {
        const board = this.boards.get(root);
        return board ? this.info(board) : undefined;
      },
      simulateBoardMessage: async (root, raw) => {
        const board = this.boards.get(root);
        if (!board) throw new Error(`no board is open for ${root}`);
        const parsed = parseWebviewToHost(raw);
        if (!parsed.ok) throw new Error(`invalid message: ${parsed.error}`);
        await this.readyBoards.get(board);
        await board.receive(raw);
      },
      workspaceFor: (root) => this.registry.peek(root),
      runsFor: (root) => this.registry.peekRunManager(root),
      restoreBoard: (panel, state) => this.restoreBoard(panel, state),
      boardRecords: () => this.records(),
      ...(this.isTest ? { testing } : {}),
    };
  }

  dispose(): void {
    for (const board of [...this.boards.values(), ...this.orphans]) board.dispose();
    this.sample?.dispose();
    this.registry.dispose();
    this.previews.dispose();
    this.proposalPreviews.dispose();
    this.messages.dispose();
    this.events.dispose();
    this.posts.dispose();
  }
}
