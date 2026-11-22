/**
 * AT4.7 the ModelWorkspace's M2 members (docs/m2-plan.md sections 4.2 and 7): readText (open buffers first),
 * modelFiles (model files + present project files), library, projectModel, applyChanges (the recorded write path
 * with history kind `accept-proposal`), and the attempts history: `graph(S).attempts` from
 * `.telelean/subjects/<S>/attempts.jsonl` via core's codecs (faked here; WP1's real ones in the gated block), newest
 * first with resolutions, reloaded by reloadAttempts and by invalidate.
 */
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { attemptsPath, type AttemptLine, type AttemptRecord, type AttemptResolution } from '@telelean/core';

import { createModelWorkspace, type ModelWorkspace, type ModelWorkspaceOptions, type WorkspaceChange } from '../../src/workspace/index.js';
import { fakeCodecs } from '../proposal/helpers.js';
import { fakeCore } from './fakeCore.js';
import { cleanup, copyMentalModel, makeTempDir, overlayTextSource, read, recordingApplier, userGit, write, type RecordingApplier } from './helpers.js';

function record(run: string, round: number, date: string, verdict: AttemptRecord['verdict'] = 'proved'): AttemptRecord {
  return {
    format: 'telelean-attempt',
    version: 1,
    id: `${run}.${round}`,
    run,
    round,
    date,
    subject: 'Spyro',
    target: 'cynder-not-good',
    premises: ['cynder-dark-past', 'new-spyro-pg', 'pg-no-dark-past'],
    verdict,
    gateAttempts: 1,
    model: 'claude-opus-5-5',
  };
}

function resolution(run: string, round: number, value: AttemptResolution['resolution']): AttemptResolution {
  return { format: 'telelean-attempt-resolution', version: 1, run, round, date: '2026-11-01T12:00:00.000Z', resolution: value };
}

const jsonl = (lines: readonly AttemptLine[]): string => lines.map((l) => `${JSON.stringify(l)}\n`).join('');

describe('AT4.7 the workspace M2 members', () => {
  let tmp: string;
  let root: string;
  let applier: RecordingApplier;
  let ws: ModelWorkspace | undefined;
  const logs: string[] = [];

  beforeEach(() => {
    tmp = makeTempDir('m2members');
    root = copyMentalModel(tmp);
    applier = recordingApplier(root);
    logs.length = 0;
  });
  afterEach(() => {
    ws?.dispose();
    ws = undefined;
    cleanup(tmp);
  });

  async function open(extra: Partial<ModelWorkspaceOptions> = {}): Promise<ModelWorkspace> {
    ws = createModelWorkspace({
      root,
      text: overlayTextSource(root),
      applier,
      core: { ...fakeCore, parseAttemptLines: fakeCodecs.parseAttemptLines, summariseAttempts: fakeCodecs.summariseAttempts },
      semantic: { enabled: false },
      git: { enabled: false },
      log: (level, message) => logs.push(`${level}: ${message}`),
      ...extra,
    });
    await ws.load();
    return ws;
  }

  it('readText reads through the TextSource (open buffers first), null when missing; paths stay inside the root', async () => {
    const text = overlayTextSource(root, new Map([['Model/Spyro/Main.lean', '-- unsaved buffer\n']]));
    const w = await open({ text });
    expect(await w.readText?.('Model/Spyro/Main.lean')).toBe('-- unsaved buffer\n');
    expect(await w.readText?.('Model/Spyro/Vocabulary.lean')).toBe(read(root, 'Model/Spyro/Vocabulary.lean'));
    expect(await w.readText?.(path.join(root, 'lean-toolchain'))).toBe(read(root, 'lean-toolchain'));
    expect(await w.readText?.('Model/Spyro/Missing.lean')).toBeNull();
    await expect(w.readText?.('../outside.lean') ?? Promise.resolve()).rejects.toThrow(TypeError);
    await expect(w.readText?.('/etc/passwd') ?? Promise.resolve()).rejects.toThrow(TypeError);
  });

  it('modelFiles lists the model files and the present project files, following invalidate', async () => {
    const w = await open();
    expect(w.modelFiles?.()).toEqual([
      'Model.lean',
      'Model/Spyro.lean',
      'Model/Spyro/Inbox.lean',
      'Model/Spyro/Main.lean',
      'Model/Spyro/Vocabulary.lean',
      'lake-manifest.json',
      'lakefile.toml',
      'lean-toolchain',
    ]);
    write(root, 'Model/Spyro/Lemmas.lean', 'namespace Spyro\nend Spyro\n');
    write(root, 'lakefile.lean', '-- a second lakefile\n');
    await w.invalidate(['Model/Spyro/Lemmas.lean', 'lakefile.lean']);
    expect(w.modelFiles?.()).toContain('Model/Spyro/Lemmas.lean');
    expect(w.modelFiles?.()).toContain('lakefile.lean');
    expect(w.modelFiles?.()).not.toContain('.gitignore');
    expect(w.modelFiles?.()).not.toContain('.telelean/config.json');
  });

  it('library and projectModel expose what the graphs are built from', async () => {
    const w = await open();
    expect(w.library?.()).toBe('Model');
    const model = w.projectModel?.();
    expect([...(model?.nodes.keys() ?? [])].sort()).toEqual(['cynder-dark-past', 'cynder-not-good', 'new-spyro-pg', 'pg-no-dark-past']);
    expect(model?.subjects.map((s) => s.name)).toEqual(['Spyro']);
  });

  it('graph(S).attempts: loaded with the board, newest first with their latest resolution', async () => {
    write(
      root,
      attemptsPath('Spyro'),
      jsonl([
        record('r1', 1, '2026-11-01T10:00:00.000Z', 'not-proved'),
        resolution('r1', 1, 'superseded'),
        record('r1', 2, '2026-11-01T11:00:00.000Z'),
        resolution('r1', 2, 'accepted'),
      ]),
    );
    const w = await open();
    expect(w.graph('Spyro').attempts?.map((a) => [a.id, a.verdict, a.resolution])).toEqual([
      ['r1.2', 'proved', 'accepted'],
      ['r1.1', 'not-proved', 'superseded'],
    ]);
  });

  it('reloadAttempts re-reads the file and republishes; invalidate of the file reloads it too', async () => {
    const w = await open();
    expect(w.graph('Spyro').attempts).toBeUndefined();
    const changes: WorkspaceChange[] = [];
    w.onDidChange((c) => changes.push(c));
    write(root, attemptsPath('Spyro'), jsonl([record('r1', 1, '2026-11-01T10:00:00.000Z')]));
    await w.reloadAttempts?.('Spyro');
    expect(changes).toEqual([{ subjects: ['Spyro'], semantic: false, subjectsListChanged: false }]);
    expect(w.graph('Spyro').attempts?.map((a) => [a.id, a.resolution])).toEqual([['r1.1', undefined]]);
    write(root, attemptsPath('Spyro'), jsonl([record('r1', 1, '2026-11-01T10:00:00.000Z'), resolution('r1', 1, 'discarded'), record('r2', 1, '2026-11-01T13:00:00.000Z')]));
    await w.invalidate([attemptsPath('Spyro')]);
    expect(changes.at(-1)).toEqual({ subjects: ['Spyro'], semantic: false, subjectsListChanged: false });
    expect(w.graph('Spyro').attempts?.map((a) => [a.id, a.resolution])).toEqual([
      ['r2.1', undefined],
      ['r1.1', 'discarded'],
    ]);
    // The graph's list is a copy: the board cannot change the workspace's records.
    const first = w.graph('Spyro').attempts?.[0];
    if (first) first.verdict = 'failed';
    expect(w.graph('Spyro').attempts?.[0]?.verdict).toBe('proved');
    await expect(w.reloadAttempts?.('../x') ?? Promise.resolve()).rejects.toThrow(TypeError);
  });

  it('an unreadable attempts file never breaks the board (logged, no attempts)', async () => {
    write(root, attemptsPath('Spyro'), 'not json\n');
    const w = await open({
      core: {
        ...fakeCore,
        parseAttemptLines: () => {
          throw new Error('codec failure');
        },
      },
    });
    expect(w.graph('Spyro').attempts).toBeUndefined();
    expect(logs.some((l) => l.startsWith('warn:') && l.includes('codec failure'))).toBe(true);
  });

  it('applyChanges: the recorded write path, one undo entry with the one-line label, refusals write nothing', async () => {
    const w = await open();
    const main = read(root, 'Model/Spyro/Main.lean');
    const after = `${main}-- accepted\n`;
    const outcome = await w.applyChanges?.({
      label: 'These suffice → proved:\nCynder would not be a good addition…',
      action: 'accept-proposal',
      subject: 'Spyro',
      nodes: ['cynder-not-good'],
      changes: [{ path: 'Model/Spyro/Main.lean', before: main, after }],
    });
    expect(outcome).toEqual({ ok: true, label: 'These suffice → proved: Cynder would not be a good addition…', undoable: true });
    expect(read(root, 'Model/Spyro/Main.lean')).toBe(after);
    expect(applier.calls).toHaveLength(1);
    expect((await w.workspaceState('Spyro')).undo).toBe('These suffice → proved: Cynder would not be a good addition…');
    expect(await w.undo('Spyro')).toMatchObject({ ok: true, label: 'Undo: These suffice → proved: Cynder would not be a good addition…' });
    expect(read(root, 'Model/Spyro/Main.lean')).toBe(main);
    // Slice 2f: the subject's layout.json and endorsements.json are accepted (an edit session's Apply); anything else is not.
    expect(await w.applyChanges?.({ label: 'x', action: 'accept-proposal', subject: 'Spyro', nodes: [], changes: [{ path: '.telelean/subjects/Spyro/decisions.json', before: null, after: '{}' }] })).toMatchObject({
      ok: false,
      code: 'unsafe',
    });
    expect(applier.calls).toHaveLength(2); // the undo; the refusal wrote nothing
    w.dispose();
    expect(await w.applyChanges?.({ label: 'x', action: 'accept-proposal', subject: 'Spyro', nodes: [], changes: [] })).toMatchObject({ ok: false, code: 'internal' });
  });

  it('applyChanges with no history chain yet: "Initial state" first, then the accept-proposal entry', async () => {
    const w = await open({ git: { enabled: true } }); // not in a repository yet: no chain
    userGit(root, 'init', '-q');
    const main = read(root, 'Model/Spyro/Main.lean');
    const outcome = await w.applyChanges?.({
      label: 'These suffice → proved: x',
      action: 'accept-proposal',
      subject: 'Spyro',
      nodes: ['cynder-not-good'],
      changes: [{ path: 'Model/Spyro/Main.lean', before: main, after: `${main}-- accepted\n` }],
    });
    expect(outcome).toMatchObject({ ok: true, undoable: true });
    const listing = await w.listHistory('Spyro');
    expect(listing.entries.map((e) => [e.action, e.label])).toEqual([
      ['accept-proposal', 'These suffice → proved: x'],
      ['initial', 'Initial state'],
    ]);
    const initial = await w.historyDiff('Spyro', listing.entries[1]?.id ?? '', 'parent');
    expect(initial.files.find((f) => f.path === 'Model/Spyro/Main.lean')?.after).toBe(main);
  });

  describe("WP1's codecs", () => {
    it("graph(S).attempts with core's real codecs: newest first, resolutions attached, bad lines skipped", async () => {
      write(
        root,
        attemptsPath('Spyro'),
        `${jsonl([record('r1', 1, '2026-11-01T10:00:00.000Z', 'not-proved'), resolution('r1', 1, 'superseded')])}not json\n${jsonl([record('r1', 2, '2026-11-01T11:00:00.000Z')])}`,
      );
      ws = createModelWorkspace({ root, text: overlayTextSource(root), applier, core: fakeCore, semantic: { enabled: false }, git: { enabled: false } });
      await ws.load();
      expect(ws.graph('Spyro').attempts?.map((a) => [a.id, a.verdict, a.resolution])).toEqual([
        ['r1.2', 'proved', undefined],
        ['r1.1', 'not-proved', 'superseded'],
      ]);
    });
  });
});
