/**
 * Spec v4 slice 1b with the real core: arrows as board edits on a scratch copy of mental_model/ in a scratch git
 * repository (Lean off). Each action is planned in core and applied, recorded and undone by the workspace like every
 * other board edit: one Undo step each, restoring the files exactly, and one History entry under its own action kind
 * (move-cards is layout only, like reorder: undoable, but not snapshotted on its own). A refusal changes nothing.
 * Slice 1f: remove-arrows also takes the "follows from nothing" marks of the same Delete, as one step.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createModelWorkspace, fsEditApplier, fsTextSource, type ModelWorkspace } from '../../src/workspace/index.js';
import { cleanup, copyMentalModel, makeTempDir, read, snapshotTree, userGit } from './helpers.js';

const MAIN = 'Model/Spyro/Main.lean';
const LAYOUT = '.telelean/subjects/Spyro/layout.json';
const GOAL = 'cynder-not-good';

describe('arrows as board edits with the real core (slice 1b)', () => {
  let tmp: string;
  let root: string;
  let ws: ModelWorkspace;
  let original: Record<string, string>;
  beforeAll(async () => {
    tmp = makeTempDir('arrows');
    root = copyMentalModel(tmp);
    userGit(root, 'init', '-q');
    ws = createModelWorkspace({ root, text: fsTextSource(root), applier: fsEditApplier(root), semantic: { enabled: false }, now: () => new Date('2026-11-19T10:00:00Z') });
    await ws.load();
    original = snapshotTree(root);
  });
  afterAll(() => {
    ws?.dispose();
    cleanup(tmp);
  });

  const node = (id: string) => ws.graph('Spyro').nodes.find((n) => n.id === id);
  const undoExactly = async () => {
    const before = snapshotTree(root);
    const undo = await ws.undo('Spyro');
    expect(undo.ok, JSON.stringify(undo)).toBe(true);
    return before;
  };

  it('remove-arrows, then add-arrows: each one step, undone exactly', async () => {
    const removed = await ws.perform({ kind: 'remove-arrows', arrows: [{ source: 'pg-no-dark-past', target: GOAL }] });
    expect(removed, JSON.stringify(removed)).toMatchObject({ ok: true, undoable: true });
    expect(removed.ok && removed.label).toMatch(/^Remove arrow: PG games cannot have characters with .*→ Cynder would not be a good addition/);
    expect(read(root, MAIN)).toContain('premises: cynder-dark-past, new-spyro-pg\n');
    expect(node(GOAL)?.premises).toEqual(['cynder-dark-past', 'new-spyro-pg']);
    expect((await ws.workspaceState('Spyro')).undo).toBe(removed.ok ? removed.label : '');

    const added = await ws.perform({ kind: 'add-arrows', target: GOAL, sources: ['pg-no-dark-past'] });
    expect(added, JSON.stringify(added)).toMatchObject({ ok: true });
    expect(read(root, MAIN)).toBe(original[MAIN]);

    await undoExactly();
    expect(read(root, MAIN)).toContain('premises: cynder-dark-past, new-spyro-pg\n');
    await undoExactly();
    expect(snapshotTree(root)[MAIN]).toBe(original[MAIN]);
  });

  it('set-from-nothing on an axiom makes it a proposition (type and layout in one step); undo restores both', async () => {
    const outcome = await ws.perform({ kind: 'set-from-nothing', id: 'new-spyro-pg', on: true });
    expect(outcome, JSON.stringify(outcome)).toMatchObject({ ok: true, label: 'Follows from nothing: The new Spyro game is PG' });
    expect(read(root, MAIN)).toContain('id: new-spyro-pg\ntype: PROPOSITION\nnatural_name: The new Spyro game is PG\nrationale: known from gaming news\nsource: reported\nfollows_from: nothing\n');
    expect(node('new-spyro-pg')).toMatchObject({ type: 'PROPOSITION', fromNothing: true });
    expect(JSON.parse(read(root, LAYOUT)).columns.PROPOSITION).toContain('new-spyro-pg');
    await undoExactly();
    expect(read(root, MAIN)).toBe(original[MAIN]);
    expect(read(root, LAYOUT)).toBe(original[LAYOUT]);
    expect(node('new-spyro-pg')?.type).toBe('AXIOM');
  });

  it('claim-pending adds the axiom .holds ("Mark pending"); undo removes it', async () => {
    const outcome = await ws.perform({ kind: 'claim-pending', id: GOAL });
    expect(outcome, JSON.stringify(outcome)).toMatchObject({ ok: true, label: 'Mark pending: Cynder would not be a good addition to the new Spyro game' });
    expect(read(root, MAIN)).toContain('abbrev cynder_not_good : Prop := ¬ GoodAddition cynder newSpyro\naxiom cynder_not_good.holds : cynder_not_good\n');
    await undoExactly();
    expect(read(root, MAIN)).toBe(original[MAIN]);
  });

  it('move-cards writes only the layout (one Undo step, no snapshot of its own)', async () => {
    const outcome = await ws.perform({ kind: 'move-cards', positions: { [GOAL]: { x: 120, y: -40 } } });
    expect(outcome, JSON.stringify(outcome)).toMatchObject({ ok: true, label: 'Move: Cynder would not be a good addition to the new Spyro game', undoable: true });
    expect(JSON.parse(read(root, LAYOUT)).positions).toEqual({ [GOAL]: { x: 120, y: -40 } });
    expect(ws.graph('Spyro').positions).toEqual({ [GOAL]: { x: 120, y: -40 } });
    expect(read(root, MAIN)).toBe(original[MAIN]);
    await undoExactly();
    expect(read(root, LAYOUT)).toBe(original[LAYOUT]);
    expect(ws.graph('Spyro')).not.toHaveProperty('positions');
  });

  it('a refusal (a cycle) changes nothing and records nothing', async () => {
    const before = snapshotTree(root);
    const undoBefore = (await ws.workspaceState('Spyro')).undo;
    const outcome = await ws.perform({ kind: 'add-arrows', target: 'pg-no-dark-past', sources: [GOAL] });
    expect(outcome).toEqual({
      ok: false,
      code: 'invalid',
      error: 'This arrow would make a cycle: Cynder would not be a good addition to … → PG games cannot have characters with da… → Cynder would not be a good addition to ….',
    });
    expect(snapshotTree(root)).toEqual(before);
    expect((await ws.workspaceState('Spyro')).undo).toBe(undoBefore);
  });

  it('slice 1f (carry-over 2): one Delete of an arrow and a "follows from nothing" mark is one step, undone exactly', async () => {
    const marked = await ws.perform({ kind: 'set-from-nothing', id: 'new-spyro-pg', on: true });
    expect(marked, JSON.stringify(marked)).toMatchObject({ ok: true });
    const afterMark = snapshotTree(root);
    const removed = await ws.perform({ kind: 'remove-arrows', arrows: [{ source: 'pg-no-dark-past', target: GOAL }], marks: ['new-spyro-pg'] });
    expect(removed, JSON.stringify(removed)).toMatchObject({ ok: true, undoable: true, label: "Remove 1 arrow and 1 'follows from nothing' mark" });
    expect(read(root, MAIN)).toContain('premises: cynder-dark-past, new-spyro-pg\n');
    expect(read(root, MAIN)).not.toContain('follows_from:');
    expect(node('new-spyro-pg')?.fromNothing).toBeUndefined();
    // One Undo takes back both.
    await undoExactly();
    expect(snapshotTree(root)).toEqual(afterMark);
    expect(node('new-spyro-pg')).toMatchObject({ type: 'PROPOSITION', fromNothing: true });
    expect(node(GOAL)?.premises).toEqual(['cynder-dark-past', 'new-spyro-pg', 'pg-no-dark-past']);
    await undoExactly();
    expect(read(root, MAIN)).toBe(original[MAIN]);
    expect(read(root, LAYOUT)).toBe(original[LAYOUT]);
  });

  it('records each action in the history under its own kind', async () => {
    const listing = await ws.listHistory('Spyro');
    const actions = listing.entries.map((e) => e.action);
    for (const kind of ['remove-arrows', 'add-arrows', 'set-from-nothing', 'claim-pending'] as const) expect(actions, kind).toContain(kind);
    expect(actions).not.toContain('move-cards');
    expect(actions).not.toContain('manual');
    expect(listing.entries.find((e) => e.action === 'claim-pending')?.label).toBe('Mark pending: Cynder would not be a good addition to the new Spyro game');
  });
});
