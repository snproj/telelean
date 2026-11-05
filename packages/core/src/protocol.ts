/**
 * Versioned host <-> webview message protocol: every message is `{ v: 1, type, payload }`.
 *
 * FROZEN CONTRACT (M1, docs/m1-plan.md section 5.5). Implemented by the architect. WP-extension and WP-webview treat
 * this file as read-only; a needed change goes to the integrator (record it in open issues).
 *
 * host -> webview
 *   graph          one subject's board (nodes, edges, vocabulary, diagnostics, Lean state)
 *   workspace      subjects, current subject, undo/redo labels, history availability
 *   history        the history dropdown's entries and storage counter (reply to historyList)
 *   actionResult   the outcome of a mutating request that carried a requestId
 *   notice         a toast (e.g. "Deleted …" with Undo, "Copied")
 * webview -> host
 *   ready, select, diagnostic                                   (M0)
 *   addNode, kindChange, theseSuffice                           (M0, extended with optional fields)
 *   editNode, deleteNode, reorder, undo, redo                   (board edits)
 *   selectSubject, createSubject                                (D-10)
 *   historyList, historyPreview, historyRevert, historyPrune, initGit   (D-33)
 *   copyText, openInEditor, refresh                             (card and toolbar buttons)
 *
 * M2 (docs/m2-plan.md section 6.3), a Claude run and its proposal:
 * host -> webview
 *   run            the root's current run (RunView) or null
 *   proposal       the current run's proposal (ProposalView) or null
 * webview -> host
 *   startRun                                                    tray "These suffice ▶" / "Self-evident?"
 *   answerQuestions, cancelRun, resumeRun, dismissRun           the run panel
 *   acceptProposal, feedback, discardProposal, openProposalDiff the review
 *   adoptGhost, rejectGhost                                     "Claude suggests" cards
 *   kindChange gains `confirmedDependents` (carry-over 3)
 *
 * `diagnostic` is the webview's own log channel (CSP violations, the "rendered" summary the smoke test asserts on).
 * Inbound messages are validated by hand-written guards (no dependencies, so the module stays usable in the webview
 * bundle under a strict CSP). The host treats everything from the webview as untrusted.
 */
import type { ActionOutcome, EditableField, HistoryListing, WorkspaceState } from './actions.js';
import type { Evidential, NodeType, Range, Stance, TlGraph } from './model.js';
import { EVIDENTIALS, isNodeType, STANCES } from './model.js';
import { isSubjectName } from './paths.js';
import type { AnswerChoiceView, DecisionScope, ProposalView, QuestionAnswer, RunView } from './run.js';
import { DECISION_SCOPES } from './run.js';

export const PROTOCOL_VERSION = 1 as const;

export interface Envelope<T extends string, P> {
  v: typeof PROTOCOL_VERSION;
  type: T;
  payload: P;
}

// ---------- host -> webview ----------

export type GraphMessage = Envelope<'graph', { graph: TlGraph }>;
export type WorkspaceMessage = Envelope<'workspace', { state: WorkspaceState }>;
export type HistoryMessage = Envelope<'history', { listing: HistoryListing }>;
export type ActionResultMessage = Envelope<'actionResult', { requestId: string; outcome: ActionOutcome }>;
export type NoticeLevel = 'info' | 'warning' | 'error';
/** A toast. `undoable`: show an Undo button (posts `undo`). */
export type NoticeMessage = Envelope<'notice', { id: string; level: NoticeLevel; text: string; undoable: boolean }>;
/**
 * M2: the model root's current run (at most one active run per root), or null when there is none (dismissed, or never
 * started). Posted on every change of the run (state, counters, questions, notices, activity) and on `ready`.
 * A run of another subject is still posted: the board shows a compact "Claude is working on <subject>" line.
 */
export type RunMessage = Envelope<'run', { run: RunView | null }>;
/** M2: the current run's proposal (state `review`), or null when there is none. Posted when it is built or cleared. */
export type ProposalMessage = Envelope<'proposal', { proposal: ProposalView | null }>;

export type HostToWebviewMessage =
  | GraphMessage
  | WorkspaceMessage
  | HistoryMessage
  | ActionResultMessage
  | NoticeMessage
  | RunMessage
  | ProposalMessage;

// ---------- webview -> host ----------

export type ReadyMessage = Envelope<'ready', { lastVersion: number | null }>;
/**
 * The user dropped a card on another column (D-11). `beforeId` is the card it was dropped above (null = end).
 * `dependents` answers the confirm dialog when the change removes a `.holds` that others use; `rationale` is the
 * optional "why do you hold it?" of a change to Assumption.
 */
export type KindChangeMessage = Envelope<
  'kindChange',
  {
    id: string;
    from: NodeType;
    to: NodeType;
    beforeId: string | null;
    requestId?: string;
    dependents?: 'rewrite' | 'mark-broken';
    rationale?: string;
    /**
     * M2 (carry-over 3): the dependents (node ids or fully-qualified Lean names) the dialog listed when the user chose
     * `dependents`; the host refuses with `needs-confirmation` (listing all) when it finds others.
     */
    confirmedDependents?: string[];
  }
>;
/** The A|D|G prompt box (D-16) created a comment-only node. `clientId` is the id the webview gave it. */
export type AddNodeMessage = Envelope<
  'addNode',
  {
    clientId: string;
    type: NodeType;
    naturalName: string;
    requestId?: string;
    rationale?: string;
    stance?: Stance;
    source?: Evidential;
  }
>;
export type SelectMessage = Envelope<'select', { ids: string[] }>;
/** M1: declares `premises` as the target's support (D-13); zero premises ("Self-evident?") is answered `not-yet` until M2. */
export type TheseSufficeMessage = Envelope<'theseSuffice', { premises: string[]; target: string; requestId?: string }>;
export type DiagnosticLevel = 'info' | 'warn' | 'error';
export type DiagnosticMessage = Envelope<
  'diagnostic',
  { level: DiagnosticLevel; code: string; message: string; data?: Record<string, string | number | boolean> }
>;
/** In-place edit. `value: null` removes the field (not allowed for `naturalName`). */
export type EditNodeMessage = Envelope<'editNode', { id: string; field: EditableField; value: string | null; requestId?: string }>;
/**
 * D-18 delete. With `keepLean: false`, when other declarations use the card's Lean (proofs, other subjects, untracked
 * lemmas) the host answers `needs-confirmation` with those `dependents`; the board lists them and sends the delete
 * again with `confirmed: true` if the user still wants it (they stop compiling).
 */
export type DeleteNodeMessage = Envelope<'deleteNode', { id: string; keepLean: boolean; confirmed?: boolean; requestId?: string }>;
/** Drag within a column (layout only). */
export type ReorderMessage = Envelope<'reorder', { id: string; column: NodeType; beforeId: string | null; requestId?: string }>;
export type UndoMessage = Envelope<'undo', { requestId?: string }>;
export type RedoMessage = Envelope<'redo', { requestId?: string }>;
export type SelectSubjectMessage = Envelope<'selectSubject', { subject: string }>;
export type CreateSubjectMessage = Envelope<'createSubject', { name: string; requestId?: string }>;
export type HistoryListMessage = Envelope<'historyList', { subject: string; limit?: number }>;
/** Opens a read-only diff of the entry against its parent or against the current files. */
export type HistoryPreviewMessage = Envelope<'historyPreview', { subject: string; entryId: string; compare: 'parent' | 'current' }>;
export type HistoryRevertMessage = Envelope<'historyRevert', { subject: string; entryId: string; requestId?: string }>;
export type HistoryPruneMessage = Envelope<'historyPrune', { subject: string; keepLast: number; requestId?: string }>;
export type InitGitMessage = Envelope<'initGit', { requestId?: string }>;
/** Copies text (e.g. a card's Lean code) to the clipboard through the host (`vscode.env.clipboard`). */
export type CopyTextMessage = Envelope<'copyText', { text: string }>;
/** Opens a model file (POSIX path relative to the model root) at a range. */
export type OpenInEditorMessage = Envelope<'openInEditor', { file: string; range?: Range }>;
export type RefreshMessage = Envelope<'refresh', Record<string, never>>;

// ---------- webview -> host, M2: runs (docs/m2-plan.md section 6.3) ----------

/**
 * "These suffice ▶" (premises not empty) or "Self-evident?" (premises empty): after egress consent the host's
 * RunManager runs preflight, then declares the premises as the target's support (M1 `set-premises`, undoable; skipped
 * for an empty list or an unchanged one; never when preflight refused), then starts a Claude run proving `target` from
 * exactly `premises` (D-5). Refused (`conflict`) while another run of this root is active. Answered with
 * `actionResult` (ok once the run started; failures name the preflight problem).
 */
export type StartRunMessage = Envelope<'startRun', { target: string; premises: string[]; requestId?: string }>;
/** Answers a pending ask_user batch (every question of the batch exactly once). */
export type AnswerQuestionsMessage = Envelope<'answerQuestions', { runId: string; setId: string; answers: QuestionAnswer[]; requestId?: string }>;
/** Interrupt + kill the run's Lean scopes; the shadow and transcript are kept (03 section 8.6). */
export type CancelRunMessage = Envelope<'cancelRun', { runId: string; requestId?: string }>;
/** Resumes an `interrupted` run (window reload mid-turn) in a new CLI process (`--resume <session>`). */
export type ResumeRunMessage = Envelope<'resumeRun', { runId: string; requestId?: string }>;
/**
 * Accept (D-21, all-or-nothing): applies the reviewed proposal to the real files through the M1 history/undo path.
 * `lifecycle` = ids of the lifecycle items the user ticked; `definitions` = ids of the definition questions answered
 * "yes" (all of them are required: a "no" is Feedback, not Accept).
 */
export type AcceptProposalMessage = Envelope<
  'acceptProposal',
  { runId: string; proposalId: string; lifecycle: string[]; definitions: string[]; requestId?: string }
>;
/** Feedback (D-21): continues the same Claude session with the user's text (a new round; statements may change). */
export type FeedbackMessage = Envelope<'feedback', { runId: string; text: string; requestId?: string }>;
export type DiscardProposalMessage = Envelope<'discardProposal', { runId: string; requestId?: string }>;
/** "I hold this" (D-6): the ghost becomes an ASSUMPTION card in the shadow; telelean re-freezes and Claude re-proves. */
export type AdoptGhostMessage = Envelope<'adoptGhost', { runId: string; ghostId: string; rationale?: string; requestId?: string }>;
export type RejectGhostMessage = Envelope<'rejectGhost', { runId: string; ghostId: string; requestId?: string }>;
/** "Raw Lean diff…": VS Code's multi-file diff (`vscode.changes`) of the proposal, optionally focused on one file. */
export type OpenProposalDiffMessage = Envelope<'openProposalDiff', { runId: string; proposalId: string; file?: string }>;
/** Removes an ended run (terminal state) from the board. */
export type DismissRunMessage = Envelope<'dismissRun', { runId: string }>;

export type WebviewToHostMessage =
  | ReadyMessage
  | KindChangeMessage
  | AddNodeMessage
  | SelectMessage
  | TheseSufficeMessage
  | DiagnosticMessage
  | EditNodeMessage
  | DeleteNodeMessage
  | ReorderMessage
  | UndoMessage
  | RedoMessage
  | SelectSubjectMessage
  | CreateSubjectMessage
  | HistoryListMessage
  | HistoryPreviewMessage
  | HistoryRevertMessage
  | HistoryPruneMessage
  | InitGitMessage
  | CopyTextMessage
  | OpenInEditorMessage
  | RefreshMessage
  | StartRunMessage
  | AnswerQuestionsMessage
  | CancelRunMessage
  | ResumeRunMessage
  | AcceptProposalMessage
  | FeedbackMessage
  | DiscardProposalMessage
  | AdoptGhostMessage
  | RejectGhostMessage
  | OpenProposalDiffMessage
  | DismissRunMessage;

/** M2: the webview messages that act on a run (the extension routes them to the root's RunManager). */
export const RUN_MESSAGE_TYPES = [
  'startRun',
  'answerQuestions',
  'cancelRun',
  'resumeRun',
  'acceptProposal',
  'feedback',
  'discardProposal',
  'adoptGhost',
  'rejectGhost',
  'openProposalDiff',
  'dismissRun',
] as const;

export type WebviewToHostType = WebviewToHostMessage['type'];
export type HostToWebviewType = HostToWebviewMessage['type'];

type PayloadOf<M extends Envelope<string, unknown>, T extends M['type']> = Extract<M, { type: T }>['payload'];

export function webviewMessage<T extends WebviewToHostType>(
  type: T,
  payload: PayloadOf<WebviewToHostMessage, T>,
): Extract<WebviewToHostMessage, { type: T }> {
  return { v: PROTOCOL_VERSION, type, payload } as Extract<WebviewToHostMessage, { type: T }>;
}

export function hostMessage<T extends HostToWebviewType>(
  type: T,
  payload: PayloadOf<HostToWebviewMessage, T>,
): Extract<HostToWebviewMessage, { type: T }> {
  return { v: PROTOCOL_VERSION, type, payload } as Extract<HostToWebviewMessage, { type: T }>;
}

// ---------- validation ----------

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** Limits that keep a misbehaving webview from flooding the host. Generous for a personal board. */
export const LIMITS = {
  idLength: 200,
  textLength: 4000,
  listLength: 2000,
  /** copyText: a card's Lean code can be long. */
  copyLength: 1_000_000,
  pathLength: 1024,
  historyLimit: 1000,
  keepLastMax: 100_000,
  /** M2: ask_user batches hold 1-3 questions (D-20). */
  answersPerBatch: 3,
  /** M2: ticked lifecycle items / approved definitions per Accept. */
  reviewItems: 200,
} as const;

/** M2: run ids double as runLean scope groups (`telelean-<runId>-<n>`). */
export const RUN_ID_PATTERN = /^[A-Za-z0-9_]{1,64}$/;
/** M2: host-generated ids of question sets, proposals, ghosts, lifecycle items and definition questions. */
export const RUN_TOKEN_PATTERN = /^[A-Za-z0-9_.-]{1,64}$/;

const DIAGNOSTIC_LEVELS: readonly DiagnosticLevel[] = ['info', 'warn', 'error'];
const EDITABLE_FIELDS: readonly EditableField[] = ['naturalName', 'rationale', 'stance', 'source'];
const REQUEST_ID = /^[A-Za-z0-9_-]{1,64}$/;
const ENTRY_ID = /^[0-9a-f]{7,64}$/;

class Invalid extends Error {}

function fail(message: string): never {
  throw new Invalid(message);
}

function record(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(`${what} must be an object`);
  return value as Record<string, unknown>;
}

function str(value: unknown, what: string, max: number, allowEmpty = false): string {
  if (typeof value !== 'string') fail(`${what} must be a string`);
  if (!allowEmpty && value.length === 0) fail(`${what} must not be empty`);
  if (value.length > max) fail(`${what} is longer than ${max} characters`);
  return value;
}

function id(value: unknown, what: string): string {
  return str(value, what, LIMITS.idLength);
}

/** A list of distinct ids (a repeated id is a webview bug, and the host must not act on it twice). */
function ids(value: unknown, what: string): string[] {
  if (!Array.isArray(value)) fail(`${what} must be an array`);
  if (value.length > LIMITS.listLength) fail(`${what} has more than ${LIMITS.listLength} entries`);
  const list = value.map((entry, i) => id(entry, `${what}[${i}]`));
  const seen = new Set<string>();
  for (const entry of list) {
    if (seen.has(entry)) fail(`${what} lists "${entry}" more than once`);
    seen.add(entry);
  }
  return list;
}

/** Keys of `diagnostic.data`: short, and never a key that plain-object assignment would treat specially. */
function dataKey(key: string): string {
  if (key.length === 0 || key.length > 64) fail('payload.data keys must be 1 to 64 characters');
  if (key === '__proto__') fail('payload.data must not have a "__proto__" key');
  return key;
}

function nodeType(value: unknown, what: string): NodeType {
  if (!isNodeType(value)) fail(`${what} must be ASSUMPTION, DERIVATION or GOAL`);
  return value;
}

function bool(value: unknown, what: string): boolean {
  if (typeof value !== 'boolean') fail(`${what} must be true or false`);
  return value;
}

function int(value: unknown, what: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) {
    fail(`${what} must be an integer from ${min} to ${max}`);
  }
  return value;
}

/** An optional request id: `{}` when absent, so spreading it adds no property. */
function requestId(value: unknown): { requestId?: string } {
  if (value === undefined) return {};
  if (typeof value !== 'string' || !REQUEST_ID.test(value)) fail('payload.requestId must be 1 to 64 letters, digits, "-" or "_"');
  return { requestId: value };
}

/** The user's sentence: non-empty, one line. */
function sentence(value: unknown, what: string): string {
  const text = str(value, what, LIMITS.textLength);
  if (text.trim().length === 0) fail(`${what} must not be blank`);
  if (/[\r\n]/.test(text)) fail(`${what} must be a single line`);
  return text;
}

function stance(value: unknown, what: string): Stance {
  if (!STANCES.includes(value as Stance)) fail(`${what} must be one of ${STANCES.join(', ')}`);
  return value as Stance;
}

function evidential(value: unknown, what: string): Evidential {
  if (!EVIDENTIALS.includes(value as Evidential)) fail(`${what} must be one of ${EVIDENTIALS.join(', ')}`);
  return value as Evidential;
}

function subject(value: unknown, what: string): string {
  const name = str(value, what, 64);
  if (!isSubjectName(name)) fail(`${what} must be a capitalised Lean identifier (letters, digits, "_")`);
  return name;
}

function entryId(value: unknown, what: string): string {
  if (typeof value !== 'string' || !ENTRY_ID.test(value)) fail(`${what} must be a commit id (7 to 64 hex digits)`);
  return value;
}

/** A model file path: POSIX, relative, no `.`/`..`/empty segments, no backslash or NUL. */
function relativePath(value: unknown, what: string): string {
  const path = str(value, what, LIMITS.pathLength);
  if (path.startsWith('/') || /[\\\0]/.test(path)) fail(`${what} must be a relative POSIX path`);
  if (path.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')) fail(`${what} must not contain empty, "." or ".." segments`);
  return path;
}

function position(value: unknown, what: string): { line: number; character: number } {
  const p = record(value, what);
  return { line: int(p.line, `${what}.line`, 0, 10_000_000), character: int(p.character, `${what}.character`, 0, 10_000_000) };
}

function range(value: unknown, what: string): Range {
  const r = record(value, what);
  return { start: position(r.start, `${what}.start`), end: position(r.end, `${what}.end`) };
}

// ---------- M2 run helpers ----------

function runId(value: unknown, what: string): string {
  if (typeof value !== 'string' || !RUN_ID_PATTERN.test(value)) fail(`${what} must be 1 to 64 letters, digits or "_"`);
  return value;
}

function token(value: unknown, what: string): string {
  if (typeof value !== 'string' || !RUN_TOKEN_PATTERN.test(value)) fail(`${what} must be 1 to 64 letters, digits, ".", "-" or "_"`);
  return value;
}

/** A list of distinct host-generated ids. */
function tokens(value: unknown, what: string, max: number): string[] {
  if (!Array.isArray(value)) fail(`${what} must be an array`);
  if (value.length > max) fail(`${what} has more than ${max} entries`);
  const list = value.map((entry, i) => token(entry, `${what}[${i}]`));
  if (new Set(list).size !== list.length) fail(`${what} lists an entry more than once`);
  return list;
}

/** Text the user typed into the run panel (an answer, feedback): not blank, may span lines. */
function freeText(value: unknown, what: string): string {
  const text = str(value, what, LIMITS.textLength);
  if (text.trim().length === 0) fail(`${what} must not be blank`);
  return text;
}

function answerChoice(value: unknown, what: string): AnswerChoiceView {
  const c = record(value, what);
  switch (c.kind) {
    case 'option':
      return { kind: 'option', option: int(c.option, `${what}.option`, 0, 3) };
    case 'free-text':
      return { kind: 'free-text', text: freeText(c.text, `${what}.text`) };
    case 'leave-open':
      return { kind: 'leave-open' };
    case 'decide-for-me':
      return { kind: 'decide-for-me' };
    default:
      return fail(`${what}.kind must be option, free-text, leave-open or decide-for-me`);
  }
}

/** 1-3 answers, one per question index (0-2), each with a choice and a D-20 scope. */
function answerList(value: unknown, what: string): QuestionAnswer[] {
  if (!Array.isArray(value)) fail(`${what} must be an array`);
  if (value.length === 0 || value.length > LIMITS.answersPerBatch) fail(`${what} must hold 1 to ${LIMITS.answersPerBatch} answers`);
  const seen = new Set<number>();
  return value.map((entry, i) => {
    const a = record(entry, `${what}[${i}]`);
    const question = int(a.question, `${what}[${i}].question`, 0, LIMITS.answersPerBatch - 1);
    if (seen.has(question)) fail(`${what} answers question ${question} more than once`);
    seen.add(question);
    if (!DECISION_SCOPES.includes(a.scope as DecisionScope)) fail(`${what}[${i}].scope must be one of ${DECISION_SCOPES.join(', ')}`);
    return { question, choice: answerChoice(a.choice, `${what}[${i}].choice`), scope: a.scope as DecisionScope };
  });
}

function envelope(raw: unknown): { type: string; payload: Record<string, unknown> } {
  const msg = record(raw, 'message');
  if (msg.v !== PROTOCOL_VERSION) fail(`unsupported protocol version ${JSON.stringify(msg.v)}`);
  return { type: str(msg.type, 'type', 64), payload: record(msg.payload, 'payload') };
}

function parse<T>(raw: unknown, body: (raw: unknown) => T): ParseResult<T> {
  try {
    return { ok: true, value: body(raw) };
  } catch (error) {
    if (error instanceof Invalid) return { ok: false, error: error.message };
    throw error;
  }
}

/** Validates a message from the webview. Returns a fresh object (no extra properties survive). */
export function parseWebviewToHost(raw: unknown): ParseResult<WebviewToHostMessage> {
  return parse(raw, (input) => {
    const { type, payload: p } = envelope(input);
    switch (type) {
      case 'ready': {
        const lastVersion = p.lastVersion;
        if (lastVersion !== null && !(typeof lastVersion === 'number' && Number.isSafeInteger(lastVersion))) {
          fail('payload.lastVersion must be an integer or null');
        }
        return webviewMessage('ready', { lastVersion });
      }
      case 'kindChange': {
        const node = id(p.id, 'payload.id');
        const from = nodeType(p.from, 'payload.from');
        const to = nodeType(p.to, 'payload.to');
        // A move within one column is a re-order, not a kind change; the webview posts `reorder` for that.
        if (from === to) fail('payload.to must differ from payload.from');
        const beforeId = p.beforeId === null ? null : id(p.beforeId, 'payload.beforeId');
        if (beforeId === node) fail('payload.beforeId must not be the moved card itself');
        let dependents: 'rewrite' | 'mark-broken' | undefined;
        if (p.dependents !== undefined) {
          if (p.dependents !== 'rewrite' && p.dependents !== 'mark-broken') fail('payload.dependents must be "rewrite" or "mark-broken"');
          dependents = p.dependents;
        }
        const rationale = p.rationale === undefined ? undefined : str(p.rationale, 'payload.rationale', LIMITS.textLength, true).trim();
        const confirmedDependents = p.confirmedDependents === undefined ? undefined : ids(p.confirmedDependents, 'payload.confirmedDependents');
        return webviewMessage('kindChange', {
          id: node,
          from,
          to,
          beforeId,
          ...requestId(p.requestId),
          ...(dependents ? { dependents } : {}),
          ...(rationale ? { rationale } : {}),
          ...(confirmedDependents ? { confirmedDependents } : {}),
        });
      }
      case 'addNode': {
        const rationale = p.rationale === undefined ? undefined : str(p.rationale, 'payload.rationale', LIMITS.textLength, true).trim();
        return webviewMessage('addNode', {
          clientId: id(p.clientId, 'payload.clientId'),
          type: nodeType(p.type, 'payload.type'),
          naturalName: sentence(p.naturalName, 'payload.naturalName'),
          ...requestId(p.requestId),
          ...(rationale ? { rationale } : {}),
          ...(p.stance !== undefined ? { stance: stance(p.stance, 'payload.stance') } : {}),
          ...(p.source !== undefined ? { source: evidential(p.source, 'payload.source') } : {}),
        });
      }
      case 'select':
        return webviewMessage('select', { ids: ids(p.ids, 'payload.ids') });
      case 'theseSuffice': {
        const premises = ids(p.premises, 'payload.premises');
        const target = id(p.target, 'payload.target');
        if (premises.includes(target)) fail('payload.target must not also be a premise');
        return webviewMessage('theseSuffice', { premises, target, ...requestId(p.requestId) });
      }
      case 'diagnostic': {
        const level = p.level;
        if (!DIAGNOSTIC_LEVELS.includes(level as DiagnosticLevel)) fail('payload.level must be info, warn or error');
        let data: Record<string, string | number | boolean> | undefined;
        if (p.data !== undefined) {
          const rawData = record(p.data, 'payload.data');
          const entries = Object.entries(rawData);
          if (entries.length > 32) fail('payload.data has more than 32 entries');
          data = {};
          for (const [rawKey, value] of entries) {
            const key = dataKey(rawKey);
            if (typeof value === 'string') data[key] = str(value, `payload.data.${key}`, LIMITS.textLength, true);
            else if (typeof value === 'number' || typeof value === 'boolean') data[key] = value;
            else fail(`payload.data.${key} must be a string, number or boolean`);
          }
        }
        return webviewMessage('diagnostic', {
          level: level as DiagnosticLevel,
          code: str(p.code, 'payload.code', 64),
          message: str(p.message, 'payload.message', LIMITS.textLength, true),
          ...(data ? { data } : {}),
        });
      }
      case 'editNode': {
        const node = id(p.id, 'payload.id');
        const field = p.field;
        if (!EDITABLE_FIELDS.includes(field as EditableField)) fail(`payload.field must be one of ${EDITABLE_FIELDS.join(', ')}`);
        let value: string | null;
        switch (field as EditableField) {
          case 'naturalName':
            value = sentence(p.value, 'payload.value');
            break;
          case 'rationale':
            value = p.value === null ? null : str(p.value, 'payload.value', LIMITS.textLength, true);
            if (value !== null && value.trim() === '') value = null;
            break;
          case 'stance':
            value = p.value === null ? null : stance(p.value, 'payload.value');
            break;
          case 'source':
            value = p.value === null ? null : evidential(p.value, 'payload.value');
            break;
        }
        return webviewMessage('editNode', { id: node, field: field as EditableField, value, ...requestId(p.requestId) });
      }
      case 'deleteNode':
        return webviewMessage('deleteNode', {
          id: id(p.id, 'payload.id'),
          keepLean: bool(p.keepLean, 'payload.keepLean'),
          ...(p.confirmed !== undefined ? { confirmed: bool(p.confirmed, 'payload.confirmed') } : {}),
          ...requestId(p.requestId),
        });
      case 'reorder': {
        const node = id(p.id, 'payload.id');
        const beforeId = p.beforeId === null ? null : id(p.beforeId, 'payload.beforeId');
        if (beforeId === node) fail('payload.beforeId must not be the moved card itself');
        return webviewMessage('reorder', { id: node, column: nodeType(p.column, 'payload.column'), beforeId, ...requestId(p.requestId) });
      }
      case 'undo':
        return webviewMessage('undo', { ...requestId(p.requestId) });
      case 'redo':
        return webviewMessage('redo', { ...requestId(p.requestId) });
      case 'selectSubject':
        return webviewMessage('selectSubject', { subject: subject(p.subject, 'payload.subject') });
      case 'createSubject':
        return webviewMessage('createSubject', { name: subject(p.name, 'payload.name'), ...requestId(p.requestId) });
      case 'historyList':
        return webviewMessage('historyList', {
          subject: subject(p.subject, 'payload.subject'),
          ...(p.limit !== undefined ? { limit: int(p.limit, 'payload.limit', 1, LIMITS.historyLimit) } : {}),
        });
      case 'historyPreview': {
        if (p.compare !== 'parent' && p.compare !== 'current') fail('payload.compare must be "parent" or "current"');
        return webviewMessage('historyPreview', {
          subject: subject(p.subject, 'payload.subject'),
          entryId: entryId(p.entryId, 'payload.entryId'),
          compare: p.compare,
        });
      }
      case 'historyRevert':
        return webviewMessage('historyRevert', {
          subject: subject(p.subject, 'payload.subject'),
          entryId: entryId(p.entryId, 'payload.entryId'),
          ...requestId(p.requestId),
        });
      case 'historyPrune':
        return webviewMessage('historyPrune', {
          subject: subject(p.subject, 'payload.subject'),
          keepLast: int(p.keepLast, 'payload.keepLast', 1, LIMITS.keepLastMax),
          ...requestId(p.requestId),
        });
      case 'initGit':
        return webviewMessage('initGit', { ...requestId(p.requestId) });
      case 'copyText':
        return webviewMessage('copyText', { text: str(p.text, 'payload.text', LIMITS.copyLength) });
      case 'openInEditor':
        return webviewMessage('openInEditor', {
          file: relativePath(p.file, 'payload.file'),
          ...(p.range !== undefined ? { range: range(p.range, 'payload.range') } : {}),
        });
      case 'refresh':
        return webviewMessage('refresh', {});
      // ---- M2 runs ----
      case 'startRun': {
        const premises = ids(p.premises, 'payload.premises');
        const target = id(p.target, 'payload.target');
        if (premises.includes(target)) fail('payload.target must not also be a premise');
        return webviewMessage('startRun', { target, premises, ...requestId(p.requestId) });
      }
      case 'answerQuestions':
        return webviewMessage('answerQuestions', {
          runId: runId(p.runId, 'payload.runId'),
          setId: token(p.setId, 'payload.setId'),
          answers: answerList(p.answers, 'payload.answers'),
          ...requestId(p.requestId),
        });
      case 'cancelRun':
        return webviewMessage('cancelRun', { runId: runId(p.runId, 'payload.runId'), ...requestId(p.requestId) });
      case 'resumeRun':
        return webviewMessage('resumeRun', { runId: runId(p.runId, 'payload.runId'), ...requestId(p.requestId) });
      case 'acceptProposal':
        return webviewMessage('acceptProposal', {
          runId: runId(p.runId, 'payload.runId'),
          proposalId: token(p.proposalId, 'payload.proposalId'),
          lifecycle: tokens(p.lifecycle, 'payload.lifecycle', LIMITS.reviewItems),
          definitions: tokens(p.definitions, 'payload.definitions', LIMITS.reviewItems),
          ...requestId(p.requestId),
        });
      case 'feedback':
        return webviewMessage('feedback', { runId: runId(p.runId, 'payload.runId'), text: freeText(p.text, 'payload.text'), ...requestId(p.requestId) });
      case 'discardProposal':
        return webviewMessage('discardProposal', { runId: runId(p.runId, 'payload.runId'), ...requestId(p.requestId) });
      case 'adoptGhost': {
        const rationale = p.rationale === undefined ? undefined : str(p.rationale, 'payload.rationale', LIMITS.textLength, true).trim();
        if (rationale !== undefined && /[\r\n]/.test(rationale)) fail('payload.rationale must be a single line');
        return webviewMessage('adoptGhost', {
          runId: runId(p.runId, 'payload.runId'),
          ghostId: token(p.ghostId, 'payload.ghostId'),
          ...(rationale ? { rationale } : {}),
          ...requestId(p.requestId),
        });
      }
      case 'rejectGhost':
        return webviewMessage('rejectGhost', { runId: runId(p.runId, 'payload.runId'), ghostId: token(p.ghostId, 'payload.ghostId'), ...requestId(p.requestId) });
      case 'openProposalDiff':
        return webviewMessage('openProposalDiff', {
          runId: runId(p.runId, 'payload.runId'),
          proposalId: token(p.proposalId, 'payload.proposalId'),
          ...(p.file !== undefined ? { file: relativePath(p.file, 'payload.file') } : {}),
        });
      case 'dismissRun':
        return webviewMessage('dismissRun', { runId: runId(p.runId, 'payload.runId') });
      default:
        return fail(`unknown message type "${type}"`);
    }
  });
}

/**
 * Light check of a message from the (trusted) host: envelope, type and top-level shapes. A graph from an older host
 * without `vocabulary` / `diagnostics` / `semantic` gets the empty defaults.
 */
export function parseHostToWebview(raw: unknown): ParseResult<HostToWebviewMessage> {
  return parse(raw, (input) => {
    const { type, payload } = envelope(input);
    switch (type) {
      case 'graph': {
        const graph = record(payload.graph, 'payload.graph');
        if (typeof graph.version !== 'number') fail('payload.graph.version must be a number');
        if (typeof graph.subject !== 'string') fail('payload.graph.subject must be a string');
        if (!Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) fail('payload.graph needs nodes and edges arrays');
        const normalised = {
          ...graph,
          vocabulary: Array.isArray(graph.vocabulary) ? graph.vocabulary : [],
          diagnostics: Array.isArray(graph.diagnostics) ? graph.diagnostics : [],
          semantic: typeof graph.semantic === 'object' && graph.semantic !== null ? graph.semantic : { state: 'unavailable' },
        };
        return hostMessage('graph', { graph: normalised as unknown as TlGraph });
      }
      case 'workspace': {
        const state = record(payload.state, 'payload.state');
        if (typeof state.subject !== 'string' || !Array.isArray(state.subjects)) fail('payload.state needs subject and subjects');
        return hostMessage('workspace', { state: state as unknown as WorkspaceState });
      }
      case 'history': {
        const listing = record(payload.listing, 'payload.listing');
        if (!Array.isArray(listing.entries)) fail('payload.listing.entries must be an array');
        return hostMessage('history', { listing: listing as unknown as HistoryListing });
      }
      case 'actionResult': {
        const outcome = record(payload.outcome, 'payload.outcome');
        if (typeof outcome.ok !== 'boolean') fail('payload.outcome.ok must be a boolean');
        return hostMessage('actionResult', { requestId: str(payload.requestId, 'payload.requestId', 64), outcome: outcome as unknown as ActionOutcome });
      }
      case 'notice': {
        const level = payload.level;
        if (level !== 'info' && level !== 'warning' && level !== 'error') fail('payload.level must be info, warning or error');
        return hostMessage('notice', {
          id: str(payload.id, 'payload.id', 64),
          level,
          text: str(payload.text, 'payload.text', LIMITS.textLength, true),
          undoable: payload.undoable === true,
        });
      }
      case 'run': {
        if (payload.run === null) return hostMessage('run', { run: null });
        const run = record(payload.run, 'payload.run');
        if (typeof run.runId !== 'string' || typeof run.state !== 'string') fail('payload.run needs runId and state');
        if (!Array.isArray(run.notices) || !Array.isArray(run.activity) || !Array.isArray(run.answered) || !Array.isArray(run.ghosts)) {
          fail('payload.run needs notices, activity, answered and ghosts arrays');
        }
        return hostMessage('run', { run: run as unknown as RunView });
      }
      case 'proposal': {
        if (payload.proposal === null) return hostMessage('proposal', { proposal: null });
        const proposal = record(payload.proposal, 'payload.proposal');
        if (typeof proposal.proposalId !== 'string' || typeof proposal.runId !== 'string') fail('payload.proposal needs runId and proposalId');
        const graph = record(proposal.graph, 'payload.proposal.graph');
        if (!Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) fail('payload.proposal.graph needs nodes and edges arrays');
        return hostMessage('proposal', { proposal: proposal as unknown as ProposalView });
      }
      default:
        return fail(`unknown message type "${type}"`);
    }
  });
}
