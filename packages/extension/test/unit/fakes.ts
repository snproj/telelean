/**
 * Test doubles for the vscode-free host logic: an in-memory ModelWorkspace, recording BoardSession ports and (M2) a
 * recording RunManager with a RunView builder (2h: M2's proposal is retired, and so is its builder).
 */
import {
  buildProjectModel,
  DEFAULT_RUN_CAPS,
  spyroGraph,
  type ActionOutcome,
  type BoardAction,
  type CanvasPosition,
  type FileChange,
  type HistoryAvailability,
  type HistoryDiff,
  type HistoryListing,
  type HostToWebviewMessage,
  type ItemDecision,
  type ProjectModel,
  type QuestionAnswer,
  type Range,
  type RunView,
  type SemanticSummary,
  type SessionView,
  type SubjectInfo,
  type TlGraph,
  type WorkspaceState,
} from '@telelean/core';
import type { LlmBackend } from '@telelean/runner/llm/types.js';
import type { FormalizeRequest, RunChange, RunManager, RunManagerOptions, RunStartRequest } from '@telelean/runner/run/types.js';
import type { Disposable, ExternalChangeSet, ModelWorkspace, WorkspaceChange } from '@telelean/runner/workspace/index.js';

import type { BoardSessionPorts, ConfirmId, LogLevel } from '../../src/logic/boardSession';
import type { ProposalDiff } from '../../src/logic/proposalPreview';

export class FakeWorkspace implements ModelWorkspace {
  readonly root: string;
  subjectList: SubjectInfo[] = [{ name: 'Spyro', nodeCount: 4, files: ['Model/Spyro/Main.lean'] }];
  performed: BoardAction[] = [];
  undone: string[] = [];
  redone: string[] = [];
  reverted: Array<{ subject: string; entryId: string }> = [];
  pruned: Array<{ subject: string; keepLast: number }> = [];
  refreshRequests: string[] = [];
  refreshNowCalls = 0;
  initGitCalls = 0;
  invalidated: string[][] = [];
  version = 100;
  history: HistoryAvailability = { state: 'ready' };
  /** The outcome `perform` returns (or computes). */
  outcome: ActionOutcome | ((action: BoardAction) => ActionOutcome) = (action) => ({ ok: true, label: `did ${action.kind}`, undoable: true });
  /** Called by `perform` before it returns (e.g. to change the subjects, as create-subject would). */
  onPerform?: (action: BoardAction) => void;
  listHistoryError?: unknown;
  diff?: HistoryDiff;
  private readonly listeners = new Set<(change: WorkspaceChange) => void>();

  constructor(root = '/models/spyro') {
    this.root = root;
  }

  async load(): Promise<void> {}
  subjects(): SubjectInfo[] {
    return this.subjectList;
  }
  graph(subject: string): TlGraph {
    if (!this.subjectList.some((s) => s.name === subject)) throw new Error(`unknown subject ${subject}`);
    return { ...spyroGraph(), subject, version: this.version };
  }
  async workspaceState(subject: string): Promise<WorkspaceState> {
    return {
      rootName: 'spyro',
      subjects: this.subjectList.map((s) => ({ name: s.name, nodeCount: s.nodeCount })),
      subject,
      undo: this.performed.length > 0 ? 'last action' : null,
      redo: null,
      history: this.history,
    };
  }
  semantic(): SemanticSummary {
    return { state: 'unavailable' };
  }
  onDidChange(listener: (change: WorkspaceChange) => void): Disposable {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }
  fire(change: WorkspaceChange): void {
    for (const listener of this.listeners) listener(change);
  }
  async invalidate(paths: readonly string[]): Promise<void> {
    this.invalidated.push([...paths]);
  }
  requestRefresh(reason: string): void {
    this.refreshRequests.push(reason);
  }
  async refreshNow(): Promise<SemanticSummary> {
    this.refreshNowCalls++;
    return { state: 'fresh' };
  }
  async perform(action: BoardAction): Promise<ActionOutcome> {
    this.performed.push(action);
    this.onPerform?.(action);
    this.version++;
    return typeof this.outcome === 'function' ? this.outcome(action) : this.outcome;
  }
  async undo(subject: string): Promise<ActionOutcome> {
    this.undone.push(subject);
    return { ok: true, label: 'Undo: did something', undoable: true };
  }
  async redo(subject: string): Promise<ActionOutcome> {
    this.redone.push(subject);
    return { ok: true, label: 'Redo: did something', undoable: true };
  }
  async historyStatus(): Promise<HistoryAvailability> {
    return this.history;
  }
  async listHistory(subject: string, limit?: number): Promise<HistoryListing> {
    if (this.listHistoryError) throw this.listHistoryError;
    const entries = [{ id: 'abc1234', time: '2026-11-01T10:00:00.000Z', action: 'initial' as const, label: 'Initial state', subject, nodes: [] }];
    return { subject, entries: entries.slice(0, limit ?? 50), storage: { subjectBytes: 10, totalBytes: 20, perSubject: { [subject]: 10 } }, more: false };
  }
  async historyDiff(subject: string, entryId: string, compare: 'parent' | 'current'): Promise<HistoryDiff> {
    return (
      this.diff ?? {
        entry: { id: entryId, time: '2026-11-01T10:00:00.000Z', action: 'add-node', label: 'Add axiom: x', subject, nodes: [] },
        compare,
        files: [{ path: 'Model/Spyro/Inbox.lean', before: 'a\n', after: 'a\nb\n' }],
      }
    );
  }
  async revert(subject: string, entryId: string): Promise<ActionOutcome> {
    this.reverted.push({ subject, entryId });
    return { ok: true, label: 'Revert to: Initial state (2026-11-01 10:00)', undoable: true };
  }
  async prune(subject: string, keepLast: number): Promise<HistoryListing> {
    this.pruned.push({ subject, keepLast });
    return { subject, entries: [], storage: { subjectBytes: 0, totalBytes: 0, perSubject: {} }, more: false };
  }
  async initGit(): Promise<HistoryAvailability> {
    this.initGitCalls++;
    this.history = { state: 'ready' };
    return this.history;
  }
  dispose(): void {}

  // M2 members (optional in the type until integration makes them required; implemented so this fake stays valid).
  applied: ExternalChangeSet[] = [];
  reloadedAttempts: string[] = [];
  texts = new Map<string, string>([['Model/Spyro/Main.lean', 'namespace Spyro\nend Spyro\n']]);
  async applyChanges(set: ExternalChangeSet): Promise<ActionOutcome> {
    this.applied.push(set);
    this.version++;
    return { ok: true, label: set.label, undoable: true };
  }
  async readText(path: string): Promise<string | null> {
    return this.texts.get(path) ?? null;
  }
  modelFiles(): string[] {
    return [...this.texts.keys()].sort();
  }
  library(): string {
    return 'Model';
  }
  projectModel(): ProjectModel {
    return buildProjectModel({ files: [], fileHashes: {}, library: 'Model' });
  }
  async reloadAttempts(subject: string): Promise<void> {
    this.reloadedAttempts.push(subject);
  }
}

export class RecordingPorts implements BoardSessionPorts {
  posts: HostToWebviewMessage[] = [];
  clipboard: string[] = [];
  opened: Array<{ absPath: string; range: Range | undefined }> = [];
  diffs: HistoryDiff[] = [];
  proposalDiffs: ProposalDiff[] = [];
  confirms: Array<{ id: ConfirmId; message: string }> = [];
  subjects: string[] = [];
  logs: Array<{ level: LogLevel; message: string }> = [];
  confirmAnswer = true;
  /** M2: what the egress consent answers, and how often it was asked. */
  consentAnswer = true;
  consentAsked = 0;
  /** Absolute paths `resolveFile` accepts (relative file -> absolute); anything else is refused. */
  files = new Map<string, string>([['Model/Spyro/Main.lean', '/models/spyro/Model/Spyro/Main.lean']]);

  async post(message: HostToWebviewMessage): Promise<boolean> {
    this.posts.push(message);
    return true;
  }
  async writeClipboard(text: string): Promise<void> {
    this.clipboard.push(text);
  }
  async resolveFile(file: string): Promise<string> {
    const absPath = this.files.get(file);
    if (!absPath) throw new Error(`refused "${file}": outside the model root`);
    return absPath;
  }
  async openFile(absPath: string, range: Range | undefined): Promise<void> {
    this.opened.push({ absPath, range });
  }
  async showHistoryDiff(diff: HistoryDiff): Promise<void> {
    this.diffs.push(diff);
  }
  async confirm(id: ConfirmId, message: string): Promise<boolean> {
    this.confirms.push({ id, message });
    return this.confirmAnswer;
  }
  subjectChanged(subject: string): void {
    this.subjects.push(subject);
  }
  log(level: LogLevel, message: string): void {
    this.logs.push({ level, message });
  }
  async claudeConsent(): Promise<boolean> {
    this.consentAsked++;
    return this.consentAnswer;
  }
  async showProposalDiff(diff: ProposalDiff): Promise<void> {
    this.proposalDiffs.push(diff);
  }

  /** Posts of one type, in order. */
  of<T extends HostToWebviewMessage['type']>(type: T): Array<Extract<HostToWebviewMessage, { type: T }>> {
    return this.posts.filter((m): m is Extract<HostToWebviewMessage, { type: T }> => m.type === type);
  }
  clear(): void {
    this.posts = [];
  }
}

// ---------------------------------------------------------------------------------------------
// M2: runs

const SAMPLE_TIME = '2026-11-01T12:00:00.000Z';
const NO_USAGE = { requests: 0, inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, costEstimateUsd: 0 };

/** A RunView with every required field (tests override what they need). */
export function sampleRun(overrides: Partial<RunView> = {}): RunView {
  return {
    runId: 'r1',
    subject: 'Spyro',
    target: 'cynder-not-good',
    premises: ['cynder-dark-past', 'new-spyro-pg', 'pg-no-dark-past'],
    state: 'working',
    stage: 'formalise',
    round: 1,
    startedAt: SAMPLE_TIME,
    updatedAt: SAMPLE_TIME,
    backend: { id: 'fake', model: 'claude-opus-5-5', effort: 'high' },
    caps: DEFAULT_RUN_CAPS,
    counters: { turns: 0, checks: 0, agentMs: 0, gateAttempts: 0 },
    usage: NO_USAGE,
    answered: [],
    notices: [],
    activity: [],
    ghosts: [],
    ...overrides,
  };
}

export type RunMethod =
  | 'start'
  | 'answer'
  | 'cancel'
  | 'resume'
  | 'dismiss'
  | 'recover'
  | 'dispose'
  // Slice 2 (docs/slice2-plan.md 2.5)
  | 'formalize'
  | 'decide'
  | 'reveal'
  | 'undoSession'
  | 'redoSession'
  | 'submit'
  | 'end'
  | 'retry'
  | 'sessionDiff'
  | 'moveProposed'
  // Slice 2j2
  | 'note';

/**
 * A recording RunManager. Like the real one (WP3), `start` obtains the backend from `options.services.backend` when
 * that is a factory (a rejection refuses the start `not-yet` with its message); everything else only records.
 */
export class FakeRunManager implements RunManager {
  calls: Array<{ method: RunMethod; args: unknown[] }> = [];
  run: RunView | null = null;
  /** Slice 2d: what `session()` returns. */
  currentSession: SessionView | null = null;
  /** The outcome every action method resolves with (or computes from the call). */
  outcome: ActionOutcome | ((method: RunMethod, args: unknown[]) => ActionOutcome | Promise<ActionOutcome>) = (method) => ({
    ok: true,
    label: `did ${method}`,
    undoable: false,
  });
  /** The backend `start` obtained. */
  backend?: LlmBackend;
  /** `recover()` waits for it (tests can hold the recovery back). */
  recovery: Promise<void> = Promise.resolve();
  /** What `dispose` returns (a promise simulates an asynchronous persist + close). */
  disposeResult: unknown = undefined;
  onDispose?: () => void;
  private readonly listeners = new Set<(change: RunChange) => void>();

  constructor(readonly options?: RunManagerOptions) {}

  current(): RunView | null {
    return this.run;
  }
  session(): SessionView | null {
    return this.currentSession;
  }
  onDidChange(listener: (change: RunChange) => void): Disposable {
    this.listeners.add(listener);
    return { dispose: () => void this.listeners.delete(listener) };
  }
  fire(change: RunChange = { run: true, proposal: true, session: true }): void {
    for (const listener of [...this.listeners]) listener(change);
  }
  get listenerCount(): number {
    return this.listeners.size;
  }
  /** Calls of one method, in order. */
  callsOf(method: RunMethod): unknown[][] {
    return this.calls.filter((c) => c.method === method).map((c) => c.args);
  }

  private async resolve(method: RunMethod, args: unknown[]): Promise<ActionOutcome> {
    this.calls.push({ method, args });
    return typeof this.outcome === 'function' ? this.outcome(method, args) : this.outcome;
  }

  async start(request: RunStartRequest): Promise<ActionOutcome> {
    const backend = this.options?.services.backend;
    if (typeof backend === 'function') {
      try {
        this.backend = await backend();
      } catch (error) {
        this.calls.push({ method: 'start', args: [request] });
        return { ok: false, code: 'not-yet', error: error instanceof Error ? error.message : String(error) };
      }
    } else if (backend) {
      this.backend = backend;
    }
    return this.resolve('start', [request]);
  }
  answer(runId: string, setId: string, answers: readonly QuestionAnswer[]): Promise<ActionOutcome> {
    return this.resolve('answer', [runId, setId, answers]);
  }
  cancel(runId: string): Promise<ActionOutcome> {
    return this.resolve('cancel', [runId]);
  }
  resume(runId: string): Promise<ActionOutcome> {
    return this.resolve('resume', [runId]);
  }
  dismiss(runId: string): Promise<ActionOutcome> {
    return this.resolve('dismiss', [runId]);
  }
  /** Slice 2d: a start obtains the backend like `start`; a mid-stage Formalize only records. */
  async formalize(request: FormalizeRequest): Promise<ActionOutcome> {
    if (request.runId === undefined) {
      const backend = this.options?.services.backend;
      if (typeof backend === 'function') {
        try {
          this.backend = await backend();
        } catch (error) {
          this.calls.push({ method: 'formalize', args: [request] });
          return { ok: false, code: 'not-yet', error: error instanceof Error ? error.message : String(error) };
        }
      } else if (backend) {
        this.backend = backend;
      }
    }
    return this.resolve('formalize', [request]);
  }
  decide(runId: string, stage: number, own: boolean, decisions: readonly ItemDecision[], confirmed: boolean): Promise<ActionOutcome> {
    return this.resolve('decide', [runId, stage, own, decisions, confirmed]);
  }
  reveal(runId: string, stage: number, via: 'show-result' | 'activity'): Promise<ActionOutcome> {
    return this.resolve('reveal', [runId, stage, via]);
  }
  undoSession(runId: string, step: number, confirmed: boolean): Promise<ActionOutcome> {
    return this.resolve('undoSession', [runId, step, confirmed]);
  }
  redoSession(runId: string, step: number, confirmed: boolean): Promise<ActionOutcome> {
    return this.resolve('redoSession', [runId, step, confirmed]);
  }
  submit(runId: string, stage: number, comment?: string): Promise<ActionOutcome> {
    return this.resolve('submit', comment === undefined ? [runId, stage] : [runId, stage, comment]);
  }
  note(runId: string, stage: number, item: string, rev: number, note: string): Promise<ActionOutcome> {
    return this.resolve('note', [runId, stage, item, rev, note]);
  }
  end(runId: string, decision: 'apply' | 'exit' | 'back', stage?: number, check?: string): Promise<ActionOutcome> {
    return this.resolve('end', [runId, decision, stage, check]);
  }
  retry(runId: string): Promise<ActionOutcome> {
    return this.resolve('retry', [runId]);
  }
  /** Slice 2e: what `sessionDiff` answers once the outcome is ok (null: the outcome itself, as every action method). */
  sessionDiffFiles: FileChange[] | null = null;
  async sessionDiff(runId: string, stage: number, confirmed: boolean): Promise<{ ok: true; kind: 'diff'; files: FileChange[] } | ActionOutcome> {
    const outcome = await this.resolve('sessionDiff', [runId, stage, confirmed]);
    return outcome.ok && this.sessionDiffFiles !== null ? { ok: true, kind: 'diff', files: this.sessionDiffFiles } : outcome;
  }
  moveProposed(runId: string, positions: Readonly<Record<string, CanvasPosition>>): Promise<ActionOutcome> {
    return this.resolve('moveProposed', [runId, positions]);
  }
  async recover(): Promise<void> {
    this.calls.push({ method: 'recover', args: [] });
    await this.recovery;
  }
  dispose(): void {
    this.calls.push({ method: 'dispose', args: [] });
    this.onDispose?.();
    return this.disposeResult as void;
  }
}
