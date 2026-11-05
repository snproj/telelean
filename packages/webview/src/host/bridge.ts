/**
 * The only place that touches `acquireVsCodeApi` (it may be called once per webview).
 * Outgoing messages are typed; incoming ones are checked against the protocol before anyone sees them.
 */
import {
  parseHostToWebview,
  webviewMessage,
  type HostToWebviewMessage,
  type WebviewToHostMessage,
} from '@telelean/core';

export interface HostBridge {
  post(message: WebviewToHostMessage): void;
  /** Subscribes to validated host messages; returns an unsubscribe function. */
  onMessage(handler: (message: HostToWebviewMessage) => void): () => void;
  /**
   * The webview's persisted state (VS Code keeps it per panel across reloads and hands it to the panel serializer).
   * Always an object; unknown keys written by others are preserved by `updateState`.
   */
  readState(): Record<string, unknown>;
  /** Merges `patch` into the persisted state. */
  updateState(patch: Record<string, unknown>): void;
}

interface WebviewApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

/** Opened outside VS Code and without the test harness: log instead of posting, keep state in memory. */
function detachedApi(): WebviewApi {
  let state: unknown;
  return {
    postMessage: (message) => console.info('[telelean] (no host)', message),
    getState: () => state,
    setState: (next) => {
      state = next;
    },
  };
}

export function connectHost(): HostBridge {
  const api: WebviewApi = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : detachedApi();
  const post = (message: WebviewToHostMessage) => api.postMessage(message);
  const readState = (): Record<string, unknown> => {
    const state = api.getState();
    return typeof state === 'object' && state !== null && !Array.isArray(state) ? { ...(state as Record<string, unknown>) } : {};
  };
  const handlers = new Set<(message: HostToWebviewMessage) => void>();

  window.addEventListener('message', (event: MessageEvent<unknown>) => {
    const parsed = parseHostToWebview(event.data);
    if (!parsed.ok) {
      post(webviewMessage('diagnostic', { level: 'warn', code: 'bad-host-message', message: parsed.error }));
      return;
    }
    for (const handler of handlers) handler(parsed.value);
  });

  return {
    post,
    onMessage(handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    readState,
    updateState(patch) {
      api.setState({ ...readState(), ...patch });
    },
  };
}

/** A Content-Security-Policy violation, as public/boot.js records it. */
export interface CspViolation {
  directive: string;
  blocked: string;
  sample: string;
  source: string;
  line: number;
}

declare global {
  interface Window {
    /** Set by public/boot.js, which the HTML loads before the stylesheet; absent if that script did not run. */
    __teleleanBoot?: { drain(sink: (violation: CspViolation) => void): void };
  }
}

/**
 * Reports Content-Security-Policy violations to the host (the smoke test asserts there are none): first those that
 * boot.js buffered while the document loaded, then every later one. Without boot.js, violations raised before the
 * bundle ran are lost, so that case is reported too, as a warning.
 */
export function reportCspViolations(host: HostBridge): void {
  const forward = (violation: CspViolation) =>
    host.post(
      webviewMessage('diagnostic', {
        level: 'error',
        code: 'csp-violation',
        message: `${violation.directive} blocked ${violation.blocked || '(inline)'}`,
        data: { ...violation },
      }),
    );
  const boot = window.__teleleanBoot;
  if (boot) {
    boot.drain(forward);
    return;
  }
  host.post(
    webviewMessage('diagnostic', {
      level: 'warn',
      code: 'no-boot-script',
      message: 'boot.js did not run, so CSP violations raised while the page loaded are not reported',
    }),
  );
  document.addEventListener('securitypolicyviolation', (event) =>
    forward({
      directive: event.effectiveDirective,
      blocked: event.blockedURI,
      sample: event.sample.slice(0, 120),
      source: event.sourceFile,
      line: event.lineNumber,
    }),
  );
}
