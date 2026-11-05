/**
 * The workspace with the real core: a short board session on a scratch copy of mental_model/
 * in a scratch git repository: add, reorder, undo, new subject (and its undo), history labels, graph.json. This
 * checks the wiring between the workspace and core's plans; the integrator's end-to-end test goes much further.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { GraphJson } from '@telelean/core';

import { createModelWorkspace, fsEditApplier, fsTextSource, type ModelWorkspace } from '../../src/workspace/index.js';
import { cleanup, copyMentalModel, exists, makeTempDir, read, userGit } from './helpers.js';

describe('a board session with the real core', () => {
  let tmp: string;
  let root: string;
  let ws: ModelWorkspace;
  beforeAll(async () => {
    tmp = makeTempDir('realcore');
    root = copyMentalModel(tmp);
    userGit(root, 'init', '-q');
    ws = createModelWorkspace({ root, text: fsTextSource(root), applier: fsEditApplier(root), semantic: { enabled: false }, now: () => new Date('2026-11-01T10:00:00Z') });
    await ws.load();
  });
  afterAll(() => {
    ws?.dispose();
    cleanup(tmp);
  });

  const ids = (): string[] => ws.graph('Spyro').nodes.map((n) => n.id);

  it('adds a card to the Inbox and the layout, and undoes it exactly', async () => {
    const inbox = read(root, 'Model/Spyro/Inbox.lean');
    const layout = read(root, '.telelean/subjects/Spyro/layout.json');
    const outcome = await ws.perform({ kind: 'add-node', subject: 'Spyro', type: 'ASSUMPTION', naturalName: 'Spyro is a purple dragon' });
    expect(outcome.ok, JSON.stringify(outcome)).toBe(true);
    const id = outcome.ok ? (outcome.nodeId ?? '') : '';
    expect(id).not.toBe('');
    expect(ids()).toContain(id);
    expect(read(root, 'Model/Spyro/Inbox.lean')).toContain('Spyro is a purple dragon');
    expect(read(root, '.telelean/subjects/Spyro/layout.json')).toContain(id);
    expect(JSON.parse(read(root, '.telelean/graph.json')) as GraphJson).toMatchObject({ format: 'telelean-graph' });

    const undo = await ws.undo('Spyro');
    expect(undo.ok, JSON.stringify(undo)).toBe(true);
    expect(read(root, 'Model/Spyro/Inbox.lean')).toBe(inbox);
    expect(read(root, '.telelean/subjects/Spyro/layout.json')).toBe(layout);
    expect(ids()).not.toContain(id);
  });

  it('reorders within a column (layout only) and undoes it', async () => {
    const before = ids();
    const outcome = await ws.perform({ kind: 'reorder', id: 'new-spyro-pg', column: 'ASSUMPTION', beforeId: before[0] ?? null });
    expect(outcome.ok, JSON.stringify(outcome)).toBe(true);
    expect(ids()[0]).toBe('new-spyro-pg');
    expect((await ws.undo('Spyro')).ok).toBe(true);
    expect(ids()).toEqual(before);
  });

  it('creates a subject (undo stack of the new subject) and its undo removes it', async () => {
    const outcome = await ws.perform({ kind: 'create-subject', name: 'Second' });
    expect(outcome.ok, JSON.stringify(outcome)).toBe(true);
    expect(ws.subjects().map((s) => s.name)).toEqual(['Second', 'Spyro']);
    expect(read(root, 'Model.lean')).toContain('import Model.Second');
    const state = await ws.workspaceState('Second');
    expect(state.undo, 'create-subject should be undone from the new subject').not.toBeNull();
    expect((await ws.undo('Second')).ok).toBe(true);
    expect(ws.subjects().map((s) => s.name)).toEqual(['Spyro']);
    expect(exists(root, 'Model/Second.lean')).toBe(false);
    expect(read(root, 'Model.lean')).toBe('import Model.Spyro\n');
  });

  it('records the session in the history', async () => {
    const listing = await ws.listHistory('Spyro');
    expect(listing.entries.map((e) => e.action)).toEqual(['undo', 'add-node', 'initial']);
    expect(listing.entries[1]?.label).toMatch(/^Add assumption: Spyro is a purple dragon$/);
    expect(listing.entries[0]?.label).toBe(`Undo: ${listing.entries[1]?.label ?? ''}`);
  });
});
