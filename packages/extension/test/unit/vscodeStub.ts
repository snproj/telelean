/**
 * A small stand-in for the `vscode` module, for unit tests of host code outside VS Code (vitest.config.mts aliases
 * `vscode` to this file; tsc still checks the real code against @types/vscode). It has what the board host's open
 * and restore paths touch at run time: events, URIs, the configuration, watchers and webview panels (fake panels
 * whose `postMessage` never resolves, like a webview VS Code has not created yet), and (M2) what activation and the
 * run paths touch: the output channel, the serializer, modal messages (answered from `messageAnswers`), content
 * providers and executed commands (recorded), and installed extensions. Tests reset it with `resetStub`.
 */
import * as path from 'node:path';

type Listener<T> = (value: T) => void;

export class EventEmitter<T> {
  private readonly listeners = new Set<Listener<T>>();
  readonly event = (listener: Listener<T>) => {
    this.listeners.add(listener);
    return { dispose: () => void this.listeners.delete(listener) };
  };
  fire(value: T): void {
    for (const listener of [...this.listeners]) listener(value);
  }
  dispose(): void {
    this.listeners.clear();
  }
}

export class Uri {
  private constructor(
    readonly scheme: string,
    readonly fsPath: string,
    readonly path: string,
    readonly query: string,
  ) {}
  static file(fsPath: string): Uri {
    return new Uri('file', fsPath, fsPath, '');
  }
  static joinPath(base: Uri, ...parts: string[]): Uri {
    return Uri.file(path.join(base.fsPath, ...parts));
  }
  static from(components: { scheme: string; path?: string; query?: string }): Uri {
    return new Uri(components.scheme, components.path ?? '', components.path ?? '', components.query ?? '');
  }
  toString(): string {
    return `${this.scheme}://${this.path}${this.query ? `?${this.query}` : ''}`;
  }
}

export class RelativePattern {
  constructor(
    readonly base: unknown,
    readonly pattern: string,
  ) {}
}

export class Range {
  constructor(
    readonly startLine: number,
    readonly startCharacter: number,
    readonly endLine: number,
    readonly endCharacter: number,
  ) {}
}

export enum ExtensionMode {
  Production = 1,
  Development = 2,
  Test = 3,
}

export enum ViewColumn {
  Active = -1,
  Beside = -2,
  One = 1,
  Two = 2,
  Three = 3,
}

const noop = { dispose() {} };

export const version = '1.140.0-stub';

/** A modal (or plain) message the host showed, with the answer the stub gave. */
export interface ShownMessage {
  level: 'info' | 'warning' | 'error';
  message: string;
  options: unknown;
  items: string[];
  answer: string | undefined;
}

/** Recorded by the stub (cleared by resetStub). */
export const shown: ShownMessage[] = [];
/** Answers for the next modal messages, in order (undefined: dismissed, like Cancel). */
export const messageAnswers: Array<string | undefined> = [];
/** Every `commands.executeCommand` call. */
export const executed: Array<{ id: string; args: unknown[] }> = [];
/** Registered text document content providers by scheme. */
export const providers = new Map<string, { provideTextDocumentContent(uri: Uri): string }>();
/** Installed extensions by id (`extensions.getExtension`). */
export const installedExtensions = new Map<string, { id: string; extensionPath: string }>();

function showMessage(level: ShownMessage['level']) {
  return async (message: string, ...rest: unknown[]): Promise<string | undefined> => {
    const options = typeof rest[0] === 'object' && rest[0] !== null ? rest.shift() : undefined;
    const items = rest.filter((item): item is string => typeof item === 'string');
    const answer = items.length > 0 ? messageAnswers.shift() : undefined;
    shown.push({ level, message, options, items, answer });
    return answer;
  };
}

/** A webview panel whose webview never becomes ready: `postMessage` records the message and never resolves. */
export interface FakePanel {
  title: string;
  viewType: string;
  active: boolean;
  visible: boolean;
  viewColumn: number | undefined;
  webview: {
    options: unknown;
    html: string;
    cspSource: string;
    asWebviewUri(uri: Uri): Uri;
    postMessage(message: unknown): Promise<boolean>;
    onDidReceiveMessage(listener: Listener<unknown>): { dispose(): void };
  };
  onDidDispose: (listener: Listener<void>) => { dispose(): void };
  reveal(): void;
  dispose(): void;
  /** Test side: what the host posted, and a way to send a message as the webview. */
  posted: unknown[];
  send(message: unknown): void;
  disposed: boolean;
}

export function fakePanel(title: string, viewType = 'telelean.board'): FakePanel {
  const received = new EventEmitter<unknown>();
  const closed = new EventEmitter<void>();
  const panel: FakePanel = {
    title,
    viewType,
    active: true,
    visible: true,
    viewColumn: ViewColumn.One,
    webview: {
      options: {},
      html: '',
      cspSource: 'vscode-webview://fake',
      asWebviewUri: (uri) => uri,
      postMessage: (message) => {
        panel.posted.push(message);
        return new Promise<boolean>(() => {});
      },
      onDidReceiveMessage: (listener) => received.event(listener),
    },
    onDidDispose: (listener) => closed.event(listener),
    reveal() {},
    dispose() {
      if (panel.disposed) return;
      panel.disposed = true;
      closed.fire();
    },
    posted: [],
    send: (message) => received.fire(message),
    disposed: false,
  };
  return panel;
}

export const created: FakePanel[] = [];

export const workspace = {
  workspaceFolders: undefined as Array<{ uri: Uri; name: string; index: number }> | undefined,
  textDocuments: [] as unknown[],
  onDidChangeTextDocument: () => noop,
  onDidSaveTextDocument: () => noop,
  registerTextDocumentContentProvider: (scheme: string, provider: { provideTextDocumentContent(uri: Uri): string }) => {
    providers.set(scheme, provider);
    return { dispose: () => void providers.delete(scheme) };
  },
  getConfiguration: () => ({ get: <T>(_key: string, fallback: T): T => fallback }),
  createFileSystemWatcher: () => ({ onDidCreate: () => noop, onDidChange: () => noop, onDidDelete: () => noop, dispose() {} }),
};

export const window = {
  tabGroups: { all: [] as unknown[] },
  createWebviewPanel: (viewType: string, title: string) => {
    const panel = fakePanel(title, viewType);
    created.push(panel);
    return panel;
  },
  showErrorMessage: showMessage('error'),
  showWarningMessage: showMessage('warning'),
  showInformationMessage: showMessage('info'),
  createOutputChannel: () => ({ info() {}, warn() {}, error() {}, debug() {}, trace() {}, dispose() {} }),
  registerWebviewPanelSerializer: () => noop,
};

export const extensions = {
  getExtension: (id: string) => installedExtensions.get(id),
};

export const env = { clipboard: { writeText: async () => undefined, readText: async () => '' } };

export const commands = {
  executeCommand: async (id: string, ...args: unknown[]): Promise<unknown> => {
    executed.push({ id, args });
    return undefined;
  },
  registerCommand: () => noop,
};

export function resetStub(): void {
  workspace.workspaceFolders = undefined;
  workspace.textDocuments = [];
  created.length = 0;
  shown.length = 0;
  messageAnswers.length = 0;
  executed.length = 0;
  providers.clear();
  installedExtensions.clear();
}
