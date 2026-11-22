/**
 * AT4.3 perform: sidecars (layout.json, attic) are materialised into whole-file FileChanges for the applier;
 * layout-only actions are applied and undoable but not snapshotted; refusals (ActionError) become `ok: false`
 * outcomes with their dependents; an applier rejection becomes `conflict` and nothing is recorded.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { emptyLayout, serializeLayout, type BoardAction } from '@telelean/core';

import { createModelWorkspace, fsTextSource, type ModelWorkspace, type ModelWorkspaceOptions } from '../../src/workspace/index.js';
import { appendToAttic } from '../../src/workspace/sidecars.js';
import { fakeCore } from './fakeCore.js';
import { cleanup, copyMentalModel, exists, makeTempDir, read, recordingApplier, snapshotTree, userGit, write, type RecordingApplier } from './helpers.js';

const NOW = new Date('2026-11-01T09:30:00.000Z');

describe('AT4.3 perform', () => {
  let tmp: string;
  let root: string;
  let applier: RecordingApplier;
  let ws: ModelWorkspace | undefined;

  beforeEach(() => {
    tmp = makeTempDir('perform');
    root = copyMentalModel(tmp);
    applier = recordingApplier(root);
  });
  afterEach(() => {
    ws?.dispose();
    ws = undefined;
    cleanup(tmp);
  });

  async function open(extra: Partial<ModelWorkspaceOptions> = {}): Promise<ModelWorkspace> {
    ws = createModelWorkspace({ root, text: fsTextSource(root), applier, core: fakeCore, semantic: { enabled: false }, git: { enabled: false }, now: () => NOW, ...extra });
    await ws.load();
    return ws;
  }

  it('add-node: the Inbox change plus a created layout.json, the new id in the outcome', async () => {
    const w = await open();
    const layoutBefore = read(root, '.telelean/subjects/Spyro/layout.json');
    const outcome = await w.perform({ kind: 'add-node', subject: 'Spyro', type: 'AXIOM', naturalName: 'Spyro is a dragon' });
    expect(outcome).toEqual({ ok: true, label: 'Add axiom: Spyro is a dragon', undoable: true, nodeId: 'spyro-is-a-dragon' });
    expect(applier.calls).toHaveLength(1);
    const [call] = applier.calls;
    expect(call?.label).toBe('Add axiom: Spyro is a dragon');
    expect(call?.changes.map((c) => c.path)).toEqual(['Model/Spyro/Inbox.lean', '.telelean/subjects/Spyro/layout.json']);
    expect(call?.changes[1]).toEqual({
      path: '.telelean/subjects/Spyro/layout.json',
      before: layoutBefore,
      after: serializeLayout({ ...emptyLayout(), columns: { AXIOM: ['spyro-is-a-dragon'], PROPOSITION: [] } }),
    });
    expect(read(root, 'Model/Spyro/Inbox.lean')).toContain('id: spyro-is-a-dragon\ntype: AXIOM\nnatural_name: Spyro is a dragon\nasserted: 2026-11-01\n');
    expect(w.graph('Spyro').nodes.map((n) => n.id)).toContain('spyro-is-a-dragon');
    expect((await w.workspaceState('Spyro')).undo).toBe('Add axiom: Spyro is a dragon');
  });

  it('delete-node: the Lean change, the layout and an attic file with the archive header', async () => {
    const w = await open();
    // Pin the column order first (a layout that lists every card), so the delete changes the layout too.
    await w.perform({ kind: 'reorder', id: 'cynder-dark-past', column: 'AXIOM', beforeId: null });
    const layoutBefore = read(root, '.telelean/subjects/Spyro/layout.json');
    expect(layoutBefore).toContain('new-spyro-pg');
    const mainBefore = read(root, 'Model/Spyro/Main.lean');
    const outcome = await w.perform({ kind: 'delete-node', id: 'new-spyro-pg' });
    expect(outcome).toMatchObject({ ok: true, label: 'Delete: The new Spyro game is PG', undoable: true });
    const changes = applier.calls[1]?.changes ?? [];
    expect(changes.map((c) => c.path)).toEqual(['Model/Spyro/Main.lean', '.telelean/subjects/Spyro/layout.json', '.telelean/subjects/Spyro/attic/new-spyro-pg.lean']);
    expect(changes[0]?.before).toBe(mainBefore);
    expect(changes[1]?.before).toBe(layoutBefore);
    expect(changes[1]?.after).not.toContain('new-spyro-pg');
    const attic = changes[2];
    expect(attic?.before).toBeNull();
    expect(attic?.after).toBe('-- archived 2026-11-01T09:30:00.000Z (deleted): Spyro.new_spyro_pg.holds\ntheorem new_spyro_pg.holds : new_spyro_pg := by\n  trivial\n');
    expect(read(root, '.telelean/subjects/Spyro/attic/new-spyro-pg.lean')).toBe(attic?.after);
    expect(w.graph('Spyro').nodes.map((n) => n.id)).not.toContain('new-spyro-pg');
  });

  it('appends attic entries to an existing attic file, a blank line apart', () => {
    const entry = { subject: 'Spyro', nodeId: 'x', declName: 'Spyro.x.holds', text: 'theorem x.holds : x := trivial', reason: 'Proposition\n-> Axiom' };
    const first = appendToAttic(null, [entry], '2026-11-01T09:30:00.000Z');
    expect(first).toBe('-- archived 2026-11-01T09:30:00.000Z (Proposition -> Axiom): Spyro.x.holds\ntheorem x.holds : x := trivial\n');
    const second = appendToAttic(first, [{ ...entry, reason: 'deleted' }, { ...entry, declName: 'Spyro.y', text: 'abbrev y : Prop := True\n', reason: 'deleted' }], 'T2');
    expect(second).toBe(`${first}\n-- archived T2 (deleted): Spyro.x.holds\ntheorem x.holds : x := trivial\n\n-- archived T2 (deleted): Spyro.y\nabbrev y : Prop := True\n`);
  });

  it('layout-only actions are applied and undoable but not snapshotted', async () => {
    userGit(root, 'init', '-q');
    const w = await open({ git: { enabled: true } });
    expect((await w.historyStatus()).state).toBe('ready');
    const before = (await w.listHistory('Spyro')).entries.map((e) => e.id);
    expect(before).toHaveLength(1); // "Initial state"
    const layoutBefore = read(root, '.telelean/subjects/Spyro/layout.json');
    const outcome = await w.perform({ kind: 'reorder', id: 'new-spyro-pg', column: 'AXIOM', beforeId: 'pg-no-dark-past' });
    expect(outcome).toMatchObject({ ok: true, label: 'Move: The new Spyro game is PG', undoable: true });
    expect(applier.calls[0]?.changes.map((c) => c.path)).toEqual(['.telelean/subjects/Spyro/layout.json']);
    expect(w.graph('Spyro').nodes.map((n) => n.id)).toEqual(['new-spyro-pg', 'pg-no-dark-past', 'cynder-dark-past', 'cynder-not-good']);
    expect((await w.listHistory('Spyro')).entries.map((e) => e.id)).toEqual(before);
    expect(await w.undo('Spyro')).toMatchObject({ ok: true, label: 'Undo: Move: The new Spyro game is PG' });
    expect(read(root, '.telelean/subjects/Spyro/layout.json')).toBe(layoutBefore);
    expect((await w.listHistory('Spyro')).entries.map((e) => e.id)).toEqual(before);
    // The layout rides along in the next real snapshot.
    await w.perform({ kind: 'reorder', id: 'new-spyro-pg', column: 'AXIOM', beforeId: 'pg-no-dark-past' });
    await w.perform({ kind: 'edit-node', id: 'cynder-dark-past', field: 'naturalName', value: 'Cynder has a dark past' });
    const after = await w.listHistory('Spyro');
    expect(after.entries.map((e) => e.label)).toEqual(['Edit sentence: Cynder has a dark past', 'Initial state']);
    const diff = await w.historyDiff('Spyro', after.entries[0]?.id ?? '', 'parent');
    expect(diff.files.map((f) => f.path)).toEqual(['.telelean/subjects/Spyro/layout.json', 'Model/Spyro/Main.lean']);
  });

  it('refusals become ok:false outcomes with their dependents, never throws', async () => {
    const w = await open();
    expect(await w.perform({ kind: 'change-kind', id: 'cynder-not-good', to: 'AXIOM', beforeId: null })).toEqual({
      ok: false,
      code: 'needs-confirmation',
      error: 'Make Axiom: 2 declarations apply this .holds to arguments.',
      dependents: ['cynder-not-good', 'Spyro.helper_lemma'],
    });
    expect(await w.perform({ kind: 'set-premises', target: 'cynder-not-good', premises: [] })).toEqual({ ok: false, code: 'not-yet', error: 'Proving from no premises is available from M2.' });
    expect(await w.perform({ kind: 'delete-node', id: 'no-such-card' })).toMatchObject({ ok: false, code: 'not-found' });
    expect(applier.calls).toHaveLength(0);
    expect((await w.workspaceState('Spyro')).undo).toBeNull();

    // A bug in a core function (an unexpected exception) is an `internal` outcome.
    ws?.dispose();
    const broken = await open({
      core: {
        ...fakeCore,
        planAction: (): never => {
          throw new Error('planAction failed (simulated bug)');
        },
      },
    });
    expect(await broken.perform({ kind: 'reorder', id: 'x', column: 'PROPOSITION', beforeId: null })).toMatchObject({ ok: false, code: 'internal' });
  });

  it('never rejects: a failure after a successful apply still reports (and records) the applied action', async () => {
    let failReads = false;
    const disk = fsTextSource(root);
    const text = {
      read: async (rel: string): Promise<string | null> => {
        if (failReads) throw new Error('editor buffer unavailable');
        return disk.read(rel);
      },
    };
    const inner = applier;
    const failing = {
      calls: inner.calls,
      async apply(changes: Parameters<RecordingApplier['apply']>[0], label: string): Promise<void> {
        await inner.apply(changes, label);
        failReads = true; // everything after the apply fails to read
      },
    };
    const w = await open({ text, applier: failing });
    const outcome = await w.perform({ kind: 'edit-node', id: 'cynder-dark-past', field: 'naturalName', value: 'Cynder has a dark past' });
    expect(outcome).toMatchObject({ ok: true, label: 'Edit sentence: Cynder has a dark past', undoable: true });
    expect((await w.workspaceState('Spyro')).undo).toBe('Edit sentence: Cynder has a dark past');
    // While reads fail, undo is an outcome too, never a rejection.
    expect(await w.undo('Spyro')).toMatchObject({ ok: false, code: 'internal', error: 'editor buffer unavailable' });
    failReads = false;
    expect(await w.undo('Spyro')).toMatchObject({ ok: true, label: 'Undo: Edit sentence: Cynder has a dark past' });
  });

  it('a project-level plan (subject "") is undone from the new subject\'s board, never lost on a "" stack', async () => {
    const w = await open({
      core: {
        ...fakeCore,
        planAction: (model, action, ctx) => ({ ...fakeCore.planAction(model, action, ctx), subject: '' }),
      },
    });
    const outcome = await w.perform({ kind: 'create-subject', name: 'Bayonetta' });
    expect(outcome).toMatchObject({ ok: true, label: 'New subject: Bayonetta' });
    expect((await w.workspaceState('Bayonetta')).undo).toBe('New subject: Bayonetta');
    expect((await w.workspaceState('Spyro')).undo).toBeNull();
    expect(await w.undo('Bayonetta')).toMatchObject({ ok: true, label: 'Undo: New subject: Bayonetta' });
    expect(exists(root, 'Model/Bayonetta.lean')).toBe(false);
  });

  it('an applier rejection (stale before) becomes conflict, and nothing is recorded', async () => {
    userGit(root, 'init', '-q');
    const w = await open({ git: { enabled: true } });
    const historyBefore = (await w.listHistory('Spyro')).entries.map((e) => e.id);
    // The user types in Main.lean; the workspace has not been told yet, so the plan's `before` is stale.
    write(root, 'Model/Spyro/Main.lean', `${read(root, 'Model/Spyro/Main.lean')}-- typed meanwhile\n`);
    const tree = snapshotTree(root);
    const action: BoardAction = { kind: 'edit-node', id: 'cynder-dark-past', field: 'naturalName', value: 'Cynder has a dark past' };
    const outcome = await w.perform(action);
    expect(outcome).toMatchObject({ ok: false, code: 'conflict' });
    expect(outcome.ok === false && outcome.error).toMatch(/Model\/Spyro\/Main\.lean changed since/);
    expect(snapshotTree(root)).toEqual(tree);
    const state = await w.workspaceState('Spyro');
    expect(state.undo).toBeNull();
    const labels = (await w.listHistory('Spyro')).entries.map((e) => e.label);
    expect(labels).not.toContain('Edit sentence: Cynder has a dark past');
    // The hand edit itself was kept as "Manual edits" before the attempt (the user's state is never lost).
    expect(labels).toEqual(['Manual edits', 'Initial state']);
    expect((await w.listHistory('Spyro')).entries.slice(1).map((e) => e.id)).toEqual(historyBefore);

    // Any other rejection is reported the same way.
    applier.failNext = new Error('disk full');
    await w.invalidate(['Model/Spyro/Main.lean']);
    expect(await w.perform(action)).toEqual({ ok: false, code: 'conflict', error: 'disk full' });
    expect((await w.workspaceState('Spyro')).undo).toBeNull();
    // Once the workspace has re-read the file, the action applies.
    expect(await w.perform(action)).toMatchObject({ ok: true });
    expect(exists(root, '.telelean/graph.json')).toBe(true);
  });
});
