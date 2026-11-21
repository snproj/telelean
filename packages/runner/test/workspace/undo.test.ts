/**
 * AT4.4 Undo/Redo: exact reversal; reverse patches past unrelated hand edits; all-or-nothing conflict refusals that
 * leave files untouched; a created file is deleted only while unchanged; a new action clears redo; undo of an undo
 * (redo) and undo of a redo work; at most 100 entries per subject.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createModelWorkspace, fsTextSource, type ModelWorkspace } from '../../src/workspace/index.js';
import { applyBackwards, backwardText, UNDO_LIMIT, UndoStacks } from '../../src/workspace/undo.js';
import { fakeCore } from './fakeCore.js';
import { cleanup, copyMentalModel, exists, makeTempDir, read, recordingApplier, snapshotTree, write, type RecordingApplier } from './helpers.js';

describe('undo arithmetic (applying a change backwards)', () => {
  const change = { path: 'f.lean', before: 'a\nb\nc\nd\ne\nf\ng\nh\ni\nj\nk\nl\n', after: 'a\nB\nc\nd\ne\nf\ng\nh\ni\nj\nk\nl\n' };

  it('is exact when the file still equals `after`, a no-op when it already equals `before`', () => {
    expect(backwardText(change, change.after)).toBe(change.before);
    expect(backwardText(change, change.before)).toBe(change.before);
  });

  it('patches past an unrelated edit outside the hunk, refuses an overlapping one (no fuzz)', () => {
    const handEdited = change.after.replace('k\n', 'K (hand edit)\n');
    expect(backwardText(change, handEdited)).toBe(change.before.replace('k\n', 'K (hand edit)\n'));
    const overlapping = change.after.replace('B\n', 'B2\n');
    expect(typeof backwardText(change, overlapping)).toBe('symbol');
    const nearby = change.after.replace('c\n', 'C\n'); // inside the hunk's context: no fuzz, so refused
    expect(typeof backwardText(change, nearby)).toBe('symbol');
  });

  it('deletes a created file only while unchanged, re-creates a deleted file only while absent', () => {
    const created = { path: 'n.lean', before: null, after: 'new\n' };
    expect(backwardText(created, 'new\n')).toBeNull();
    expect(backwardText(created, null)).toBeNull(); // already gone: nothing to do
    expect(typeof backwardText(created, 'new\nedited\n')).toBe('symbol');
    const deleted = { path: 'd.lean', before: 'old\n', after: null };
    expect(backwardText(deleted, null)).toBe('old\n');
    expect(typeof backwardText(deleted, 'recreated by hand\n')).toBe('symbol');
  });

  it('applies all or nothing', async () => {
    const files = new Map<string, string | null>([
      ['a', 'A2'],
      ['b', 'changed by hand'],
    ]);
    const result = await applyBackwards(
      [
        { path: 'a', before: 'A1', after: 'A2' },
        { path: 'b', before: 'B1', after: 'B2' },
      ],
      async (p) => files.get(p) ?? null,
    );
    expect(result).toEqual({ ok: false, path: 'b' });
  });

  it('keeps at most 100 entries per subject', () => {
    const stacks = new UndoStacks();
    for (let i = 0; i < UNDO_LIMIT + 20; i++) stacks.record({ label: `op ${i}`, subject: 'S', nodes: [], changes: [], layoutOnly: false });
    let count = 0;
    while (stacks.peek('undo', 'S')) {
      stacks.move('undo', 'S', []);
      count++;
    }
    expect(count).toBe(UNDO_LIMIT);
    expect(stacks.labels('S')).toEqual({ undo: null, redo: 'op 20' });
    expect(stacks.labels('Other')).toEqual({ undo: null, redo: null });
  });
});

describe('AT4.4 undo and redo in a workspace', () => {
  let tmp: string;
  let root: string;
  let applier: RecordingApplier;
  let ws: ModelWorkspace;

  beforeEach(async () => {
    tmp = makeTempDir('undo');
    root = copyMentalModel(tmp);
    applier = recordingApplier(root);
    ws = createModelWorkspace({ root, text: fsTextSource(root), applier, core: fakeCore, semantic: { enabled: false }, git: { enabled: false } });
    await ws.load();
  });
  afterEach(() => {
    ws.dispose();
    cleanup(tmp);
  });

  const edit = (id: string, value: string) => ws.perform({ kind: 'edit-node', id, field: 'naturalName', value });

  it('reverses exactly (every file, sidecars included) and redoes exactly', async () => {
    const original = snapshotTree(root);
    expect(await ws.perform({ kind: 'add-node', subject: 'Spyro', type: 'PROPOSITION', naturalName: 'Spyro saves the day' })).toMatchObject({ ok: true });
    const added = snapshotTree(root);
    expect(added).not.toEqual(original);
    expect(await ws.workspaceState('Spyro')).toMatchObject({ undo: 'Add proposition: Spyro saves the day', redo: null });

    expect(await ws.undo('Spyro')).toEqual({ ok: true, label: 'Undo: Add proposition: Spyro saves the day', undoable: false });
    const { ['.telelean/graph.json']: _g1, ...afterUndo } = snapshotTree(root);
    const { ['.telelean/graph.json']: _g0, ...originalModel } = original;
    expect(afterUndo).toEqual(originalModel);
    expect(ws.graph('Spyro').nodes.map((n) => n.id)).not.toContain('spyro-saves-the-day');
    expect(await ws.workspaceState('Spyro')).toMatchObject({ undo: null, redo: 'Add proposition: Spyro saves the day' });

    expect(await ws.redo('Spyro')).toEqual({ ok: true, label: 'Redo: Add proposition: Spyro saves the day', undoable: true });
    const { ['.telelean/graph.json']: _g2, ...afterRedo } = snapshotTree(root);
    const { ['.telelean/graph.json']: _g3, ...addedModel } = added;
    expect(afterRedo).toEqual(addedModel);
    expect(ws.graph('Spyro').nodes.map((n) => n.id)).toContain('spyro-saves-the-day');
    expect(applier.calls.map((c) => c.label)).toEqual(['Add proposition: Spyro saves the day', 'Undo: Add proposition: Spyro saves the day', 'Redo: Add proposition: Spyro saves the day']);
  });

  it('reverse-patches past an unrelated hand edit elsewhere in the same file, keeping the hand edit', async () => {
    const main = 'Model/Spyro/Main.lean';
    const original = read(root, main);
    await edit('pg-no-dark-past', 'PG games never feature characters with dark pasts');
    const edited = read(root, main);
    const handEdited = edited.replace('end Spyro', '-- a note typed by hand\n\nend Spyro');
    write(root, main, handEdited);
    await ws.invalidate([main]);
    expect(await ws.undo('Spyro')).toMatchObject({ ok: true, label: 'Undo: Edit sentence: PG games never feature characters with dark pasts' });
    expect(read(root, main)).toBe(original.replace('end Spyro', '-- a note typed by hand\n\nend Spyro'));
    // ... and redo forward-patches the same way.
    expect(await ws.redo('Spyro')).toMatchObject({ ok: true });
    expect(read(root, main)).toBe(handEdited);
  });

  it('refuses with conflict when the change no longer fits, leaving every file untouched', async () => {
    const main = 'Model/Spyro/Main.lean';
    await ws.perform({ kind: 'add-node', subject: 'Spyro', type: 'AXIOM', naturalName: 'Cynder can change' });
    await edit('cynder-dark-past', 'Cynder had a dark past');
    write(root, main, read(root, main).replace('natural_name: Cynder had a dark past', 'natural_name: Cynder had a very dark past'));
    await ws.invalidate([main]);
    const before = snapshotTree(root);
    const calls = applier.calls.length;
    expect(await ws.undo('Spyro')).toEqual({ ok: false, code: 'conflict', error: 'Model/Spyro/Main.lean changed since; use History to revert' });
    expect(snapshotTree(root)).toEqual(before);
    expect(applier.calls.length).toBe(calls);
    expect((await ws.workspaceState('Spyro')).undo).toBe('Edit sentence: Cynder had a dark past'); // still there
  });

  it('deletes a file the action created only while it is unchanged', async () => {
    expect(await ws.perform({ kind: 'create-subject', name: 'Bayonetta' })).toMatchObject({ ok: true, label: 'New subject: Bayonetta' });
    expect(ws.subjects().map((s) => s.name)).toEqual(['Bayonetta', 'Spyro']);
    const created = 'Model/Bayonetta/Main.lean';
    const text = read(root, created);
    write(root, created, `${text}-- my own first line\n`);
    await ws.invalidate([created]);
    const before = snapshotTree(root);
    expect(await ws.undo('Bayonetta')).toEqual({ ok: false, code: 'conflict', error: `${created} changed since; use History to revert` });
    expect(snapshotTree(root)).toEqual(before);

    write(root, created, text);
    await ws.invalidate([created]);
    expect(await ws.undo('Bayonetta')).toMatchObject({ ok: true, label: 'Undo: New subject: Bayonetta' });
    for (const rel of ['Model/Bayonetta.lean', 'Model/Bayonetta/Vocabulary.lean', 'Model/Bayonetta/Inbox.lean', created, '.telelean/subjects/Bayonetta/layout.json']) {
      expect(exists(root, rel), rel).toBe(false);
    }
    expect(read(root, 'Model.lean')).toBe('import Model.Spyro\n');
    expect(ws.subjects().map((s) => s.name)).toEqual(['Spyro']); // the subject disappeared
    expect(() => ws.graph('Bayonetta')).toThrow(/unknown subject/);
    // Redo re-creates it.
    expect(await ws.redo('Bayonetta')).toMatchObject({ ok: true });
    expect(ws.subjects().map((s) => s.name)).toEqual(['Bayonetta', 'Spyro']);
  });

  it('a new action clears redo; undo of an undo (redo) and undo of a redo work', async () => {
    const main = 'Model/Spyro/Main.lean';
    const v0 = read(root, main);
    await edit('cynder-dark-past', 'one');
    const v1 = read(root, main);
    await edit('cynder-dark-past', 'two');
    const v2 = read(root, main);

    await ws.undo('Spyro');
    expect(read(root, main)).toBe(v1);
    expect(await ws.workspaceState('Spyro')).toMatchObject({ undo: 'Edit sentence: one', redo: 'Edit sentence: two' });
    await ws.redo('Spyro'); // undo the undo
    expect(read(root, main)).toBe(v2);
    await ws.undo('Spyro'); // undo the redo
    expect(read(root, main)).toBe(v1);
    await ws.undo('Spyro');
    expect(read(root, main)).toBe(v0);
    expect(await ws.undo('Spyro')).toEqual({ ok: false, code: 'not-found', error: 'Nothing to undo.' });
    await ws.redo('Spyro');
    expect(read(root, main)).toBe(v1);
    expect((await ws.workspaceState('Spyro')).redo).toBe('Edit sentence: two');

    await edit('new-spyro-pg', 'three'); // a new action clears redo
    expect(await ws.workspaceState('Spyro')).toMatchObject({ undo: 'Edit sentence: three', redo: null });
    expect(await ws.redo('Spyro')).toEqual({ ok: false, code: 'not-found', error: 'Nothing to redo.' });
  });

  it('keeps undo per subject', async () => {
    await ws.perform({ kind: 'create-subject', name: 'Other' });
    await edit('cynder-dark-past', 'Spyro edit');
    expect((await ws.workspaceState('Other')).undo).toBe('New subject: Other');
    expect((await ws.workspaceState('Spyro')).undo).toBe('Edit sentence: Spyro edit');
    expect(await ws.undo('Spyro')).toMatchObject({ ok: true, label: 'Undo: Edit sentence: Spyro edit' });
    expect((await ws.workspaceState('Other')).undo).toBe('New subject: Other');
  });
});
