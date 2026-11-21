import { ActionError, parseWebviewToHost, type WebviewToHostMessage } from '@telelean/core';
import { beforeEach, describe, expect, it } from 'vitest';

import { BoardSession, outcomeFromError } from '../../src/logic/boardSession';
import { FakeWorkspace, RecordingPorts } from './fakes';

function message(type: string, payload: Record<string, unknown> = {}): WebviewToHostMessage {
  const parsed = parseWebviewToHost({ v: 1, type, payload });
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.value;
}

let ws: FakeWorkspace;
let ports: RecordingPorts;
let session: BoardSession;

beforeEach(() => {
  ws = new FakeWorkspace();
  ports = new RecordingPorts();
  session = new BoardSession({ root: ws.root, rootName: 'spyro', workspace: ws, ports });
});

/** A second Spyro proposition, whose proof passes cynder-not-good's (conditional) proof its arguments. */
const USER = { id: 'cynder-would-not-sell', naturalName: 'A Spyro game with Cynder would not sell' };

/** Adds USER to the fake workspace's Spyro graph (spec v4: the kind change with dependents is P->A of a conditional proof). */
function withUserOfTheGoal(): void {
  const spyro = ws.graph('Spyro');
  const goal = spyro.nodes.find((n) => n.id === 'cynder-not-good');
  if (!goal) throw new Error('the sample has no proposition');
  ws.graph = (subject: string) => ({ ...spyro, subject, nodes: [...spyro.nodes, { ...goal, ...USER }] });
}

describe('publishing', () => {
  it('answers "ready" with the workspace state, then the subject graph', async () => {
    await session.handle(message('ready', { lastVersion: null }));
    expect(ports.posts.map((p) => p.type)).toEqual(['workspace', 'graph']);
    const [state] = ports.of('workspace');
    expect(state?.payload.state).toMatchObject({ subject: 'Spyro', rootName: 'spyro', history: { state: 'ready' } });
    expect(ports.of('graph')[0]?.payload.graph.subject).toBe('Spyro');
  });

  it('starts on the restored subject when it exists, else on the first one', () => {
    ws.subjectList = [
      { name: 'Alpha', nodeCount: 0, files: [] },
      { name: 'Spyro', nodeCount: 4, files: [] },
    ];
    expect(new BoardSession({ root: ws.root, rootName: 'spyro', workspace: ws, subject: 'Spyro', ports }).subject).toBe('Spyro');
    expect(new BoardSession({ root: ws.root, rootName: 'spyro', workspace: ws, subject: 'Gone', ports }).subject).toBe('Alpha');
  });

  it('republishes on workspace changes, coalescing a burst', async () => {
    const changes = [1, 2, 3, 4].map(() => session.onWorkspaceChange({ subjects: ['Spyro'], semantic: false, subjectsListChanged: false }));
    await Promise.all(changes);
    const graphs = ports.of('graph').length;
    expect(graphs).toBeGreaterThanOrEqual(1);
    expect(graphs).toBeLessThanOrEqual(2);
  });
});

describe('actions: actionResult and notices (AT5.7)', () => {
  it('performs the mapped action, then posts actionResult (requestId) and an undoable notice with the label', async () => {
    ws.outcome = { ok: true, label: 'Add axiom: Cynder is a dragon', undoable: true, nodeId: 'cynder-is-a-dragon' };
    await session.handle(message('addNode', { clientId: 'tmp-1', type: 'AXIOM', naturalName: 'Cynder is a dragon', requestId: 'req-1' }));
    expect(ws.performed).toEqual([{ kind: 'add-node', subject: 'Spyro', type: 'AXIOM', naturalName: 'Cynder is a dragon' }]);
    const [result] = ports.of('actionResult');
    expect(result?.payload).toEqual({ requestId: 'req-1', outcome: ws.outcome });
    const [notice] = ports.of('notice');
    expect(notice?.payload).toMatchObject({ level: 'info', text: 'Add axiom: Cynder is a dragon', undoable: true });
    expect(ports.posts.map((p) => p.type)).toEqual(['actionResult', 'notice', 'workspace', 'graph']);
  });

  it('without a requestId posts no actionResult, only the notice', async () => {
    await session.handle(message('deleteNode', { id: 'pg-no-dark-past', keepLean: false }));
    expect(ports.of('actionResult')).toEqual([]);
    expect(ports.of('notice')[0]?.payload).toMatchObject({ text: 'did delete-node', undoable: true });
  });

  it('a refusal with a request id is an actionResult only (the webview shows it once); needs-confirmation goes to the webview dialog', async () => {
    ws.outcome = { ok: false, code: 'conflict', error: 'Model/Spyro/Main.lean changed since; use History to revert' };
    await session.handle(message('editNode', { id: 'n', field: 'naturalName', value: 'x', requestId: 'r-2' }));
    expect(ports.of('actionResult')[0]?.payload.outcome).toEqual(ws.outcome);
    expect(ports.of('notice')).toEqual([]);

    ports.clear(); // without a request id nobody else tells the user: a warning notice
    await session.handle(message('editNode', { id: 'n', field: 'naturalName', value: 'x' }));
    expect(ports.of('notice')[0]?.payload).toMatchObject({ level: 'warning', undoable: false, text: expect.stringContaining('changed since') });

    ports.clear();
    withUserOfTheGoal();
    ws.outcome = { ok: false, code: 'needs-confirmation', error: 'others use it', dependents: [USER.id] };
    await session.handle(message('kindChange', { id: 'cynder-not-good', from: 'PROPOSITION', to: 'AXIOM', beforeId: null, requestId: 'r-3' }));
    expect(ports.of('actionResult')[0]?.payload).toEqual({
      requestId: 'r-3',
      outcome: { ...ws.outcome, dependentCards: { [USER.id]: { subject: 'Spyro', type: 'PROPOSITION', naturalName: USER.naturalName } } },
    });
    expect(ports.of('notice')).toEqual([]);

    ports.clear(); // without a requestId the webview cannot ask: tell the user
    await session.handle(message('kindChange', { id: 'cynder-not-good', from: 'PROPOSITION', to: 'AXIOM', beforeId: null }));
    expect(ports.of('notice')[0]?.payload.level).toBe('warning');
  });

  it('needs-confirmation names the cards among the dependents, in any subject, so the board shows them by their sentence', async () => {
    ws.subjectList = [
      { name: 'Spyro', nodeCount: 4, files: ['Model/Spyro/Main.lean'] },
      { name: 'Bayonetta', nodeCount: 1, files: ['Model/Bayonetta/Main.lean'] },
    ];
    const spyro = ws.graph('Spyro');
    const goal = spyro.nodes.find((n) => n.id === 'cynder-not-good');
    if (!goal) throw new Error('the sample has no goal');
    const otherGoal = { ...goal, id: 'other-goal', subject: 'Bayonetta', naturalName: 'Bayonetta would be a good addition' };
    ws.graph = (subject: string) => (subject === 'Bayonetta' ? { ...spyro, subject, nodes: [otherGoal], edges: [] } : spyro);
    const dependents = ['cynder-not-good', 'other-goal', 'Spyro.helper_lemma'];
    ws.outcome = { ok: false, code: 'needs-confirmation', error: 'Deleting its Lean code breaks 3 declarations that use it', dependents };
    await session.handle(message('deleteNode', { id: 'cynder-dark-past', keepLean: false, requestId: 'r-9' }));
    expect(ports.of('actionResult')[0]?.payload.outcome).toEqual({
      ...ws.outcome,
      dependentCards: {
        'cynder-not-good': { subject: 'Spyro', type: 'PROPOSITION', naturalName: 'Cynder would not be a good addition to the new Spyro game' },
        'other-goal': { subject: 'Bayonetta', type: 'PROPOSITION', naturalName: 'Bayonetta would be a good addition' },
      },
    });

    // Other refusals, and a list with no card in it, are passed on as they are.
    ports.clear();
    ws.outcome = { ok: false, code: 'needs-confirmation', error: 'a lemma uses it', dependents: ['Spyro.helper_lemma'] };
    await session.handle(message('deleteNode', { id: 'cynder-dark-past', keepLean: false, requestId: 'r-10' }));
    expect(ports.of('actionResult')[0]?.payload.outcome).toEqual(ws.outcome);
    ports.clear();
    ws.outcome = { ok: false, code: 'unsafe', error: 'no', dependents: ['cynder-not-good'] };
    await session.handle(message('deleteNode', { id: 'cynder-dark-past', keepLean: false, requestId: 'r-11' }));
    expect(ports.of('actionResult')[0]?.payload.outcome).toEqual(ws.outcome);
  });

  it('M2 carry-over 3: a kind change sends the dependents the dialog listed; core finding more answers needs-confirmation with all of them, cards named (AT5.7)', async () => {
    // Spec v4: making a proposition with a conditional proof an axiom; its users pass the proof arguments.
    // The user chose "rewrite" for the one dependent the dialog showed; core (WP1) finds a second one the board did not list.
    withUserOfTheGoal();
    const error = 'cynder_not_good.holds takes a hypothesis, but as an axiom it becomes `axiom cynder_not_good.holds : cynder_not_good`, so 2 dependents that pass it arguments must change';
    ws.outcome = (action) =>
      action.kind === 'change-kind' && action.confirmedDependents?.includes('Spyro.helper_lemma')
        ? { ok: true, label: 'Make Axiom: Cynder would not be a good addition to the new Spyro game (dependents rewritten)', undoable: true }
        : { ok: false, code: 'needs-confirmation', error, dependents: [USER.id, 'Spyro.helper_lemma'] };
    const send = (requestId: string, confirmed: string[]) =>
      session.handle(
        message('kindChange', { id: 'cynder-not-good', from: 'PROPOSITION', to: 'AXIOM', beforeId: null, dependents: 'rewrite', confirmedDependents: confirmed, requestId }),
      );
    await send('k1', [USER.id]);
    expect(ws.performed[0]).toEqual({
      kind: 'change-kind',
      id: 'cynder-not-good',
      to: 'AXIOM',
      beforeId: null,
      dependents: 'rewrite',
      confirmedDependents: [USER.id],
    });
    // The refusal lists every dependent, and names the cards among them, so the board re-asks with the host's list.
    expect(ports.of('actionResult')[0]?.payload.outcome).toEqual({
      ok: false,
      code: 'needs-confirmation',
      error,
      dependents: [USER.id, 'Spyro.helper_lemma'],
      dependentCards: { [USER.id]: { subject: 'Spyro', type: 'PROPOSITION', naturalName: USER.naturalName } },
    });
    // The re-sent change with both listed goes through.
    await send('k2', [USER.id, 'Spyro.helper_lemma']);
    expect(ports.of('actionResult')[1]?.payload.outcome).toMatchObject({ ok: true });
    expect(ws.performed.map((a) => (a.kind === 'change-kind' ? a.confirmedDependents : undefined))).toEqual([
      [USER.id],
      [USER.id, 'Spyro.helper_lemma'],
    ]);
  });

  it('an exception from the runner becomes an internal error outcome, never a crash', async () => {
    ws.outcome = () => {
      throw new Error('boom');
    };
    await session.handle(message('reorder', { id: 'a', column: 'PROPOSITION', beforeId: null, requestId: 'r-4' }));
    expect(ports.of('actionResult')[0]?.payload.outcome).toEqual({ ok: false, code: 'internal', error: 'boom' });
    expect(ports.of('notice')).toEqual([]);
    await session.handle(message('reorder', { id: 'a', column: 'PROPOSITION', beforeId: null }));
    expect(ports.of('notice')[0]?.payload.level).toBe('error');
    expect(outcomeFromError(new ActionError('needs-confirmation', 'x', ['a']))).toEqual({ ok: false, code: 'needs-confirmation', error: 'x', dependents: ['a'] });
  });

  it('"These suffice" with premises declares them; with none it is answered not-yet without calling the runner', async () => {
    await session.handle(message('theseSuffice', { premises: ['a', 'b'], target: 'g', requestId: 's1' }));
    expect(ws.performed).toEqual([{ kind: 'set-premises', target: 'g', premises: ['a', 'b'] }]);
    ports.clear();
    await session.handle(message('theseSuffice', { premises: [], target: 'g', requestId: 's2' }));
    expect(ws.performed).toHaveLength(1);
    expect(ports.of('actionResult')[0]?.payload.outcome).toMatchObject({ ok: false, code: 'not-yet' });
  });

  it('undo and redo act on the board subject; their notices offer no Undo', async () => {
    await session.handle(message('undo', { requestId: 'u1' }));
    await session.handle(message('redo', {}));
    expect(ws.undone).toEqual(['Spyro']);
    expect(ws.redone).toEqual(['Spyro']);
    expect(ports.of('actionResult').map((m) => m.payload.requestId)).toEqual(['u1']);
    expect(ports.of('notice').map((m) => [m.payload.text, m.payload.undoable])).toEqual([
      ['Undo: did something', false],
      ['Redo: did something', false],
    ]);
  });

  it('runs mutating messages one at a time, in arrival order', async () => {
    const order: string[] = [];
    ws.outcome = (action) => {
      order.push(action.kind);
      return { ok: true, label: action.kind, undoable: true };
    };
    await Promise.all([
      session.handle(message('addNode', { clientId: 'c', type: 'PROPOSITION', naturalName: 'g' })),
      session.handle(message('reorder', { id: 'a', column: 'PROPOSITION', beforeId: null })),
      session.handle(message('deleteNode', { id: 'a', keepLean: true })),
    ]);
    expect(order).toEqual(['add-node', 'reorder', 'delete-node']);
  });
});

describe('spec v4 slice 1b: arrows as board edits (routed like every action)', () => {
  it('each arrow message becomes its BoardAction, then actionResult and an undoable notice with the label', async () => {
    const labels: Record<string, string> = {
      'add-arrows': 'Draw arrow: Cynder is a character who has a dark past → Cynder would not be a good addition…',
      'remove-arrows': 'Remove arrow: PG games cannot have characters with… → Cynder would not be a good addition…',
      'set-from-nothing': 'Follows from nothing: Cynder would not be a good addition to the new Spyro game',
      'claim-pending': 'Mark pending: Cynder would not be a good addition to the new Spyro game',
      'move-cards': 'Move: Cynder would not be a good addition to the new Spyro game',
    };
    ws.outcome = (action) => ({ ok: true, label: labels[action.kind] ?? action.kind, undoable: true });
    await session.handle(message('addArrows', { target: 'cynder-not-good', sources: ['cynder-dark-past'], requestId: 'b1' }));
    await session.handle(message('removeArrows', { arrows: [{ source: 'pg-no-dark-past', target: 'cynder-not-good' }], confirmed: true, requestId: 'b2' }));
    await session.handle(message('setFromNothing', { id: 'cynder-not-good', on: true, requestId: 'b3' }));
    await session.handle(message('claimPending', { id: 'cynder-not-good', requestId: 'b4' }));
    await session.handle(message('moveCards', { positions: { 'cynder-not-good': { x: 40, y: 80 } }, requestId: 'b5' }));
    expect(ws.performed).toEqual([
      { kind: 'add-arrows', target: 'cynder-not-good', sources: ['cynder-dark-past'] },
      { kind: 'remove-arrows', arrows: [{ source: 'pg-no-dark-past', target: 'cynder-not-good' }], confirmed: true },
      { kind: 'set-from-nothing', id: 'cynder-not-good', on: true },
      { kind: 'claim-pending', id: 'cynder-not-good' },
      { kind: 'move-cards', positions: { 'cynder-not-good': { x: 40, y: 80 } } },
    ]);
    expect(ports.of('actionResult').map((m) => [m.payload.requestId, m.payload.outcome.ok])).toEqual([
      ['b1', true],
      ['b2', true],
      ['b3', true],
      ['b4', true],
      ['b5', true],
    ]);
    expect(ports.of('notice').map((m) => [m.payload.text, m.payload.undoable])).toEqual(Object.values(labels).map((label) => [label, true]));
    // Each answer is followed by a fresh workspace state and graph (the undo label and the board follow the change).
    expect(ports.posts.filter((p) => p.type === 'graph')).toHaveLength(5);
  });

  it('needs-confirmation for an arrow change goes back to the board with the cards named (the dialog shows them by sentence)', async () => {
    withUserOfTheGoal();
    const error =
      'Drawing this arrow into “The new Spyro game is PG” makes it a proposition. `axiom new_spyro_pg.holds` stays, marked pending proof, until a run proves it (`theorem new_spyro_pg.holds : … := …`). 1 card that rests on it will lose its green glow until it is proved.';
    ws.outcome = (action) =>
      action.kind === 'add-arrows' && action.confirmed !== true
        ? { ok: false, code: 'needs-confirmation', error, dependents: [USER.id] }
        : { ok: true, label: 'Draw arrow: Cynder is a character who has a dark past → The new Spyro game is PG', undoable: true };
    await session.handle(message('addArrows', { target: 'new-spyro-pg', sources: ['cynder-dark-past'], requestId: 'c1' }));
    expect(ports.of('actionResult')[0]?.payload.outcome).toEqual({
      ok: false,
      code: 'needs-confirmation',
      error,
      dependents: [USER.id],
      dependentCards: { [USER.id]: { subject: 'Spyro', type: 'PROPOSITION', naturalName: USER.naturalName } },
    });
    expect(ports.of('notice')).toEqual([]);
    // The board's dialog sends it again, confirmed.
    await session.handle(message('addArrows', { target: 'new-spyro-pg', sources: ['cynder-dark-past'], confirmed: true, requestId: 'c2' }));
    expect(ws.performed.map((a) => (a.kind === 'add-arrows' ? a.confirmed === true : undefined))).toEqual([false, true]);
    expect(ports.of('actionResult')[1]?.payload.outcome).toMatchObject({ ok: true });
  });

  it('a refusal (a cycle) is an actionResult only; without a request id a warning notice says it', async () => {
    ws.outcome = { ok: false, code: 'invalid', error: 'This arrow would make a cycle: A → B → A.' };
    await session.handle(message('addArrows', { target: 'a', sources: ['b'], requestId: 'd1' }));
    expect(ports.of('actionResult')[0]?.payload.outcome).toEqual(ws.outcome);
    expect(ports.of('notice')).toEqual([]);
    ports.clear();
    await session.handle(message('addArrows', { target: 'a', sources: ['b'] }));
    expect(ports.of('notice')[0]?.payload).toMatchObject({ level: 'warning', text: 'This arrow would make a cycle: A → B → A.', undoable: false });
  });

  it('arrow messages queue with the other board edits, in arrival order; undo then acts on the board subject', async () => {
    const order: string[] = [];
    ws.outcome = (action) => {
      order.push(action.kind);
      return { ok: true, label: action.kind, undoable: true };
    };
    await Promise.all([
      session.handle(message('addArrows', { target: 'g', sources: ['a'] })),
      session.handle(message('editNode', { id: 'g', field: 'naturalName', value: 'G' })),
      session.handle(message('setFromNothing', { id: 'h', on: true })),
      session.handle(message('moveCards', { positions: { g: { x: 1, y: 2 } } })),
    ]);
    expect(order).toEqual(['add-arrows', 'edit-node', 'set-from-nothing', 'move-cards']);
    await session.handle(message('undo', { requestId: 'u9' }));
    expect(ws.undone).toEqual(['Spyro']);
  });
});

describe('subjects (AT5.7)', () => {
  it('switches to a created subject and remembers it', async () => {
    ws.onPerform = (action) => {
      if (action.kind === 'create-subject') ws.subjectList = [...ws.subjectList, { name: action.name, nodeCount: 0, files: [] }];
    };
    await session.handle(message('createSubject', { name: 'Bayonetta', requestId: 'c1' }));
    expect(session.subject).toBe('Bayonetta');
    expect(ports.subjects).toEqual(['Bayonetta']);
    expect(ports.of('graph').at(-1)?.payload.graph.subject).toBe('Bayonetta');
    expect(ports.of('workspace').at(-1)?.payload.state.subject).toBe('Bayonetta');
  });

  it('selectSubject switches; an unknown subject is refused with a notice', async () => {
    ws.subjectList = [...ws.subjectList, { name: 'Other', nodeCount: 1, files: [] }];
    await session.handle(message('selectSubject', { subject: 'Other' }));
    expect(session.subject).toBe('Other');
    expect(ports.of('graph').at(-1)?.payload.graph.subject).toBe('Other');
    await session.handle(message('selectSubject', { subject: 'Missing' }));
    expect(session.subject).toBe('Other');
    expect(ports.of('notice').at(-1)?.payload.text).toContain('no subject "Missing"');
  });

  it('a vanished subject (undo of create-subject, a revert) switches the board to the first remaining one', async () => {
    ws.subjectList = [
      { name: 'Spyro', nodeCount: 4, files: [] },
      { name: 'Bayonetta', nodeCount: 0, files: [] },
    ];
    await session.handle(message('selectSubject', { subject: 'Bayonetta' }));
    ports.clear();
    ws.subjectList = [{ name: 'Spyro', nodeCount: 4, files: [] }];
    await session.onWorkspaceChange({ subjects: ['Bayonetta'], semantic: false, subjectsListChanged: true });
    expect(session.subject).toBe('Spyro');
    expect(ports.subjects.at(-1)).toBe('Spyro');
    expect(ports.of('notice')[0]?.payload.text).toBe('Subject "Bayonetta" no longer exists; showing "Spyro".');
    expect(ports.of('graph').at(-1)?.payload.graph.subject).toBe('Spyro');
  });

  it('when the last subject vanishes the board shows the workspace state only', async () => {
    ws.subjectList = [];
    await session.onWorkspaceChange({ subjects: ['Spyro'], semantic: false, subjectsListChanged: true });
    expect(session.subject).toBe('');
    expect(ports.of('graph')).toEqual([]);
    expect(ports.of('workspace')[0]?.payload.state.subject).toBe('');
    await session.handle(message('addNode', { clientId: 'c', type: 'PROPOSITION', naturalName: 'g', requestId: 'a1' }));
    expect(ws.performed).toEqual([]);
    expect(ports.of('actionResult')[0]?.payload.outcome).toMatchObject({ ok: false, code: 'invalid' });
  });
});

describe('history, git, clipboard, editor, refresh', () => {
  it('historyList posts the listing; an unavailable history posts an empty one', async () => {
    await session.handle(message('historyList', { subject: 'Spyro', limit: 5 }));
    expect(ports.of('history')[0]?.payload.listing.entries).toHaveLength(1);
    ports.clear();
    ws.listHistoryError = new ActionError('no-history', 'not a repository');
    await session.handle(message('historyList', { subject: 'Spyro' }));
    expect(ports.of('history')[0]?.payload.listing).toEqual({ subject: 'Spyro', entries: [], storage: { subjectBytes: 0, totalBytes: 0, perSubject: {} }, more: false });
    expect(ports.of('notice')).toEqual([]);
  });

  it('historyPreview opens the diff; historyRevert reports like an action; historyPrune posts the new listing', async () => {
    await session.handle(message('historyPreview', { subject: 'Spyro', entryId: 'abc1234', compare: 'parent' }));
    expect(ports.diffs).toHaveLength(1);
    await session.handle(message('historyRevert', { subject: 'Spyro', entryId: 'abc1234', requestId: 'rv' }));
    expect(ws.reverted).toEqual([{ subject: 'Spyro', entryId: 'abc1234' }]);
    expect(ports.of('actionResult').at(-1)?.payload.outcome).toMatchObject({ ok: true, undoable: true });
    expect(ports.of('notice').at(-1)?.payload.undoable).toBe(true);
    await session.handle(message('historyPrune', { subject: 'Spyro', keepLast: 3, requestId: 'pr' }));
    expect(ws.pruned).toEqual([{ subject: 'Spyro', keepLast: 3 }]);
    expect(ports.of('history').at(-1)?.payload.listing.entries).toEqual([]);
    expect(ports.of('actionResult').at(-1)?.payload.outcome).toMatchObject({ ok: true, undoable: false });
  });

  it('initGit asks first; "no" changes nothing', async () => {
    ws.history = { state: 'no-repo' };
    ports.confirmAnswer = false;
    await session.handle(message('initGit', { requestId: 'g1' }));
    expect(ws.initGitCalls).toBe(0);
    expect(ports.confirms.map((c) => c.id)).toEqual(['initGit']);
    expect(ports.of('actionResult')[0]?.payload.outcome).toEqual({ ok: true, label: 'Not initialized: history stays off.', undoable: false });
    expect(ports.of('notice')[0]?.payload).toMatchObject({ level: 'info', text: 'Not initialized: history stays off.', undoable: false });
    ports.confirmAnswer = true;
    await session.handle(message('initGit', { requestId: 'g2' }));
    expect(ws.initGitCalls).toBe(1);
    expect(ports.of('actionResult').at(-1)?.payload.outcome).toMatchObject({ ok: true });
    expect(ports.of('workspace').at(-1)?.payload.state.history).toEqual({ state: 'ready' });
  });

  it('copyText writes the clipboard and says "Copied"', async () => {
    await session.handle(message('copyText', { text: 'abbrev x : Prop := y' }));
    expect(ports.clipboard).toEqual(['abbrev x : Prop := y']);
    expect(ports.of('notice')[0]?.payload).toMatchObject({ text: 'Copied', undoable: false });
  });

  it('openInEditor opens files inside the root and refuses the rest (AT5.7)', async () => {
    const range = { start: { line: 3, character: 0 }, end: { line: 4, character: 2 } };
    await session.handle(message('openInEditor', { file: 'Model/Spyro/Main.lean', range }));
    expect(ports.opened).toEqual([{ absPath: '/models/spyro/Model/Spyro/Main.lean', range }]);
    await session.handle(message('openInEditor', { file: 'Model/elsewhere.lean' }));
    expect(ports.opened).toHaveLength(1);
    expect(ports.of('notice').at(-1)?.payload).toMatchObject({ level: 'warning', text: expect.stringContaining('Not opened') });
  });

  it('refresh runs refreshNow and republishes', async () => {
    await session.handle(message('refresh'));
    expect(ws.refreshNowCalls).toBe(1);
    expect(ports.of('graph')).toHaveLength(1);
  });
});
