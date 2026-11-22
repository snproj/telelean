/**
 * Spec v4 ES-7, ES-9, UN-3 (slice 1f; docs/slice1-plan.md 2.7): while a run of the model folder is active (any state
 * before it ends, on any subject) the host refuses every message that would change the folder's files, before planning:
 * the action messages, Undo, Redo and History revert, with core's EDIT_SESSION_ACTIVE (`conflict`). Reading the board
 * stays allowed. A start locks the board from the request on, and lets the board edits sent before it finish first
 * (slice 1e: also those still queued when it arrives).
 */
import { EDIT_SESSION_ACTIVE, parseWebviewToHost, type RunState, type WebviewToHostMessage } from '@telelean/core';
import { beforeEach, describe, expect, it } from 'vitest';

import { ACTION_MESSAGE_TYPES } from '../../src/logic/actionMapping';
import { BoardSession } from '../../src/logic/boardSession';
import type { RunsHandle } from '../../src/logic/runs';
import { FakeRunManager, FakeWorkspace, RecordingPorts, sampleRun } from './fakes';

function message(type: string, payload: Record<string, unknown> = {}): WebviewToHostMessage {
  const parsed = parseWebviewToHost({ v: 1, type, payload });
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.value;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** One valid message of every type that changes the model folder's files (each with request id `e-<type>`). */
const EDITS: ReadonlyArray<[string, Record<string, unknown>]> = [
  ['addNode', { clientId: 'tmp-1', type: 'AXIOM', naturalName: 'Cynder can fly' }],
  ['editNode', { id: 'cynder-not-good', field: 'naturalName', value: 'Cynder would be bad' }],
  ['deleteNode', { id: 'pg-no-dark-past' }],
  ['kindChange', { id: 'cynder-not-good', from: 'PROPOSITION', to: 'AXIOM', beforeId: null }],
  ['reorder', { id: 'cynder-dark-past', column: 'AXIOM', beforeId: null }],
  ['theseSuffice', { premises: ['cynder-dark-past'], target: 'cynder-not-good' }],
  ['createSubject', { name: 'Bayonetta' }],
  ['addArrows', { target: 'cynder-not-good', sources: ['cynder-dark-past'] }],
  ['removeArrows', { arrows: [{ source: 'cynder-dark-past', target: 'cynder-not-good' }], marks: ['new-spyro-pg'] }],
  ['setFromNothing', { id: 'cynder-not-good', on: true }],
  ['claimPending', { id: 'cynder-not-good' }],
  ['moveCards', { positions: { 'cynder-not-good': { x: 10, y: 20 } } }],
  ['undo', {}],
  ['redo', {}],
  ['historyRevert', { subject: 'Spyro', entryId: 'abc1234' }],
];

const ACTIVE: readonly RunState[] = ['starting', 'working', 'waiting-for-answer', 'gate', 'review', 'interrupted'];
const ENDED: readonly RunState[] = ['accepted', 'discarded', 'cancelled', 'failed'];

let ws: FakeWorkspace;
let ports: RecordingPorts;
let runs: FakeRunManager;
let session: BoardSession;

function makeSession(handle: RunsHandle = { manager: runs, recovered: Promise.resolve() }): BoardSession {
  return new BoardSession({ root: ws.root, rootName: 'spyro', workspace: ws, ports, runs: handle });
}

/** The files-changing calls the fake workspace saw. */
const changed = () => [...ws.performed.map((a) => a.kind), ...ws.undone.map(() => 'undo'), ...ws.redone.map(() => 'redo'), ...ws.reverted.map(() => 'revert')];

/** Sends every edit with a request id; returns the outcomes by message type. */
async function sendEdits(): Promise<Record<string, unknown>> {
  for (const [type, payload] of EDITS) await session.handle(message(type, { ...payload, requestId: `e-${type}` }));
  const outcomes: Record<string, unknown> = {};
  for (const result of ports.of('actionResult')) outcomes[result.payload.requestId.slice(2)] = result.payload.outcome;
  return outcomes;
}

beforeEach(() => {
  ws = new FakeWorkspace();
  ports = new RecordingPorts();
  runs = new FakeRunManager();
  session = makeSession();
});

describe('the board is read-only while a run of the model folder is active (ES-9, UN-3)', () => {
  it('covers every action message, plus Undo, Redo and History revert', () => {
    const covered = new Set(EDITS.map(([type]) => type));
    for (const type of ACTION_MESSAGE_TYPES) expect(covered.has(type), type).toBe(true);
    for (const type of ['undo', 'redo', 'historyRevert']) expect(covered.has(type), type).toBe(true);
  });

  it('refuses each of them in every active state, before planning, with the session text (conflict)', async () => {
    for (const state of ACTIVE) {
      ports.clear();
      runs.run = sampleRun({ state });
      const outcomes = await sendEdits();
      for (const [type] of EDITS) expect(outcomes[type], `${state} ${type}`).toEqual({ ok: false, code: 'conflict', error: EDIT_SESSION_ACTIVE });
      expect(ports.of('notice'), state).toEqual([]); // the board shows the refusal it asked about
    }
    expect(changed()).toEqual([]);
    expect(EDIT_SESSION_ACTIVE).toBe("An edit session is active: the board can't be edited until you apply or exit it.");
  });

  it('a run of another subject locks this board too (the folder shares one base)', async () => {
    runs.run = sampleRun({ subject: 'Bayonetta', target: 'bayonetta-goal', state: 'review' });
    const outcomes = await sendEdits();
    expect(Object.values(outcomes).every((o) => JSON.stringify(o) === JSON.stringify({ ok: false, code: 'conflict', error: EDIT_SESSION_ACTIVE }))).toBe(true);
    expect(changed()).toEqual([]);
  });

  it('without a request id the refusal is a warning toast', async () => {
    runs.run = sampleRun({ state: 'working' });
    await session.handle(message('undo', {}));
    await session.handle(message('editNode', { id: 'cynder-not-good', field: 'rationale', value: 'x' }));
    expect(ports.of('notice').map((n) => [n.payload.level, n.payload.text, n.payload.undoable])).toEqual([
      ['warning', EDIT_SESSION_ACTIVE, false],
      ['warning', EDIT_SESSION_ACTIVE, false],
    ]);
    expect(changed()).toEqual([]);
  });

  it('allows them all when no run is active: none at all, or one that has ended', async () => {
    let outcomes = await sendEdits();
    for (const [type] of EDITS) expect(outcomes[type], type).toMatchObject({ ok: true });
    for (const state of ENDED) {
      ports.clear();
      runs.run = sampleRun({ state });
      outcomes = await sendEdits();
      for (const [type] of EDITS) expect(outcomes[type], `${state} ${type}`).toMatchObject({ ok: true });
    }
    expect(ws.undone).toHaveLength(1 + ENDED.length);
    expect(ws.reverted).toHaveLength(1 + ENDED.length);
    // No runs at all in this window (or none available): nothing locks the board either.
    session = new BoardSession({ root: ws.root, rootName: 'spyro', workspace: ws, ports });
    ports.clear();
    await session.handle(message('undo', { requestId: 'u1' }));
    expect(ports.of('actionResult')[0]?.payload.outcome).toMatchObject({ ok: true });
    session = makeSession({ unavailable: 'Claude runs are not available: no storage folder' });
    ports.clear();
    await session.handle(message('redo', { requestId: 'r1' }));
    expect(ports.of('actionResult')[0]?.payload.outcome).toMatchObject({ ok: true });
  });

  it('reading the board stays allowed: subjects, history listing and preview, copy, open, refresh (and Keep last N, Initialize git)', async () => {
    ws.subjectList = [
      { name: 'Spyro', nodeCount: 4, files: ['Model/Spyro/Main.lean'] },
      { name: 'Bayonetta', nodeCount: 1, files: ['Model/Bayonetta/Main.lean'] },
    ];
    session = makeSession();
    runs.run = sampleRun({ state: 'review', proposalId: 'p1' });
    await session.handle(message('selectSubject', { subject: 'Bayonetta' }));
    expect(session.subject).toBe('Bayonetta');
    await session.handle(message('historyList', { subject: 'Bayonetta', limit: 5 }));
    expect(ports.of('history')).toHaveLength(1);
    await session.handle(message('historyPreview', { subject: 'Bayonetta', entryId: 'abc1234', compare: 'parent' }));
    expect(ports.diffs).toHaveLength(1);
    await session.handle(message('copyText', { text: 'abbrev x : Prop := y' }));
    expect(ports.clipboard).toEqual(['abbrev x : Prop := y']);
    await session.handle(message('openInEditor', { file: 'Model/Spyro/Main.lean' }));
    expect(ports.opened).toHaveLength(1);
    await session.handle(message('refresh'));
    expect(ws.refreshNowCalls).toBe(1);
    await session.handle(message('historyPrune', { subject: 'Bayonetta', keepLast: 3, requestId: 'pr' }));
    expect(ws.pruned).toEqual([{ subject: 'Bayonetta', keepLast: 3 }]);
    await session.handle(message('initGit', { requestId: 'g1' }));
    expect(ws.initGitCalls).toBe(1);
    expect(changed()).toEqual([]);
  });

  it('the run messages themselves still reach the RunManager (2h: a session\'s review, Apply and Exit)', async () => {
    runs.run = sampleRun({ state: 'review' });
    await session.handle(message('decideItems', { runId: 'r1', stage: 1, own: true, decisions: [{ item: 'it0123456789abcdef', rev: 1, to: 'accepted' }], requestId: 'a1' }));
    await session.handle(message('endSession', { runId: 'r1', decision: 'apply', stage: 1, check: 'ck0123456789abcdef', requestId: 'p1' }));
    await session.handle(message('endSession', { runId: 'r1', decision: 'exit', requestId: 'd1' }));
    expect(runs.calls.map((c) => c.method)).toEqual(['decide', 'end', 'end']);
  });

  it('a run recovered from an earlier window locks the board from the first message on (edits wait for the recovery)', async () => {
    let recover!: () => void;
    session = makeSession({ manager: runs, recovered: new Promise<void>((resolve) => (recover = resolve)) });
    const editing = session.handle(message('addNode', { clientId: 'tmp-1', type: 'AXIOM', naturalName: 'Cynder can fly', requestId: 'e1' }));
    await sleep(10);
    expect(ws.performed).toEqual([]);
    runs.run = sampleRun({ state: 'review' }); // what the recovery brought back
    recover();
    await editing;
    expect(ws.performed).toEqual([]);
    expect(ports.of('actionResult')[0]?.payload.outcome).toEqual({ ok: false, code: 'conflict', error: EDIT_SESSION_ACTIVE });
  });

  it('a RunManager whose current() throws is logged and locks nothing (Accept still checks the files, ES-7)', async () => {
    runs.current = () => {
      throw new Error('broken state');
    };
    await session.handle(message('undo', { requestId: 'u1' }));
    expect(ports.of('actionResult')[0]?.payload.outcome).toMatchObject({ ok: true });
    expect(ports.logs.some((l) => l.level === 'error' && /broken state/.test(l.message))).toBe(true);
  });
});

describe('starting a run locks the board from the request on (ES-7: the base is the files when the run starts)', () => {
  const START = { target: 'cynder-not-good', premises: ['cynder-dark-past'] };
  /** Slice 2h: a start is a one-inference `formalize` (M2's `startRun` is retired). */
  const start = (requestId: string) => message('formalize', { inferences: [START], requestId });

  it('board edits sent while the start is on its way are refused; a refused start unlocks the board again', async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    runs.outcome = async (method) => {
      if (method === 'formalize') await held;
      return method === 'formalize' ? { ok: false, code: 'not-yet', error: 'Claude could not be started: no binary' } : { ok: true, label: method, undoable: false };
    };
    const starting = session.handle(start('s1'));
    await sleep(10);
    expect(runs.callsOf('formalize')).toHaveLength(1);
    await session.handle(message('editNode', { id: 'cynder-not-good', field: 'naturalName', value: 'x', requestId: 'e1' }));
    await session.handle(message('undo', { requestId: 'u1' }));
    expect(ports.of('actionResult').map((m) => [m.payload.requestId, m.payload.outcome])).toEqual([
      ['e1', { ok: false, code: 'conflict', error: EDIT_SESSION_ACTIVE }],
      ['u1', { ok: false, code: 'conflict', error: EDIT_SESSION_ACTIVE }],
    ]);
    release();
    await starting;
    expect(changed()).toEqual([]);
    // The start was refused and no run is active: the board can be edited again.
    ports.clear();
    await session.handle(message('editNode', { id: 'cynder-not-good', field: 'naturalName', value: 'x', requestId: 'e2' }));
    expect(ports.of('actionResult')[0]?.payload.outcome).toMatchObject({ ok: true });
    expect(ws.performed.map((a) => a.kind)).toEqual(['edit-node']);
  });

  it('the consent question locks the board too; declining it unlocks it', async () => {
    let answer!: (yes: boolean) => void;
    ports.claudeConsent = () => new Promise<boolean>((resolve) => (answer = resolve));
    const starting = session.handle(start('s1'));
    await sleep(5);
    await session.handle(message('deleteNode', { id: 'pg-no-dark-past', requestId: 'e1' }));
    expect(ports.of('actionResult')[0]?.payload.outcome).toEqual({ ok: false, code: 'conflict', error: EDIT_SESSION_ACTIVE });
    answer(false);
    await starting;
    expect(runs.callsOf('formalize')).toEqual([]);
    await session.handle(message('deleteNode', { id: 'pg-no-dark-past', requestId: 'e2' }));
    expect(ws.performed.map((a) => a.kind)).toEqual(['delete-node']);
  });

  it('slice 1e (1f carry-over): an edit still queued behind another when the start arrives is applied, not refused', async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const order: string[] = [];
    const perform = ws.perform.bind(ws);
    ws.perform = async (action) => {
      order.push(`perform ${action.kind}`);
      if (action.kind === 'add-node') await held;
      return perform(action);
    };
    runs.outcome = (method) => {
      order.push(`runs.${method}`);
      return { ok: true, label: method, undoable: false };
    };
    // e1 is under way; e2 waits behind it in the queue; then the start arrives; then e3 (after the start).
    const first = session.handle(message('addNode', { clientId: 'tmp-1', type: 'AXIOM', naturalName: 'Cynder can fly', requestId: 'e1' }));
    const second = session.handle(message('moveCards', { positions: { 'cynder-not-good': { x: 10, y: 20 } }, requestId: 'e2' }));
    const starting = session.handle(start('s1'));
    const third = session.handle(message('moveCards', { positions: { 'cynder-not-good': { x: 30, y: 40 } }, requestId: 'e3' }));
    await sleep(10);
    expect(order).toEqual(['perform add-node']);
    release();
    await Promise.all([first, second, starting, third]);
    // The two edits sent before the start are applied, in order, before the run starts from the files; the one sent
    // after it is refused.
    expect(order).toEqual(['perform add-node', 'perform move-cards', 'runs.formalize']);
    expect(ports.of('actionResult').map((m) => [m.payload.requestId, m.payload.outcome.ok])).toEqual([
      ['e1', true],
      ['e2', true],
      ['e3', false],
      ['s1', true],
    ]);
    expect(ports.of('actionResult').find((m) => m.payload.requestId === 'e3')?.payload.outcome).toEqual({ ok: false, code: 'conflict', error: EDIT_SESSION_ACTIVE });
  });

  it('board edits sent before the start finish first, so the run starts from files that include them', async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const order: string[] = [];
    const perform = ws.perform.bind(ws);
    ws.perform = async (action) => {
      order.push(`perform ${action.kind} begins`);
      await held;
      order.push(`perform ${action.kind} ends`);
      return perform(action);
    };
    runs.outcome = (method) => {
      order.push(`runs.${method}`);
      return { ok: true, label: method, undoable: false };
    };
    const editing = session.handle(message('addNode', { clientId: 'tmp-1', type: 'AXIOM', naturalName: 'Cynder can fly', requestId: 'e1' }));
    await sleep(5);
    const starting = session.handle(start('s1'));
    await sleep(10);
    expect(order).toEqual(['perform add-node begins']); // the start waits for the edit already under way
    release();
    await Promise.all([editing, starting]);
    expect(order).toEqual(['perform add-node begins', 'perform add-node ends', 'runs.formalize']);
    expect(ports.of('actionResult').map((m) => [m.payload.requestId, m.payload.outcome.ok])).toEqual([
      ['e1', true],
      ['s1', true],
    ]);
  });
});
