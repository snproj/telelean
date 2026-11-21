/**
 * AT4.8 the run sidecar store on disk: attempts.jsonl is append-only (one write per line on an O_APPEND descriptor, so
 * concurrent writers, in this process or another, never interleave), resolutions are appended lines, decisions.json is
 * replaced atomically (temp file inside `.telelean/`, then rename; a failure leaves the old file and no temp), and
 * neither file is ever part of a history snapshot or an Undo. Fake codecs now; WP1's real ones in the gated block.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  attemptsPath,
  decisionsPath,
  type AttemptRecord,
  type AttemptResolution,
  type DecisionRecord,
} from '@telelean/core';

import { createRunSidecarStore, type SidecarCore } from '../../src/proposal/index.js';
import { createModelWorkspace, fsTextSource } from '../../src/workspace/index.js';
import { fakeCore as fakeWorkspaceCore } from '../workspace/fakeCore.js';
import { cleanup, copyMentalModel, makeTempDir, read, recordingApplier, userGit, write } from '../workspace/helpers.js';
import { fakeCodecs } from './helpers.js';

function record(run: string, round: number, date: string, extra: Partial<AttemptRecord> = {}): AttemptRecord {
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
    verdict: 'proved',
    footprint: ['cynder-dark-past', 'new-spyro-pg', 'pg-no-dark-past', 'presup:Spyro.Character.exists', 'presup:Spyro.Game.exists'],
    summary: 'Proved from the three premises under the normative reading.',
    gateAttempts: 1,
    model: 'claude-opus-5-5',
    effort: 'high',
    usage: { requests: 12, inputTokens: 3000, outputTokens: 800, costEstimateUsd: 0.42 },
    ...extra,
  };
}

function resolution(run: string, round: number, value: AttemptResolution['resolution'], date = '2026-11-01T12:00:00.000Z'): AttemptResolution {
  return { format: 'telelean-attempt-resolution', version: 1, run, round, date, resolution: value };
}

function decision(id: string, extra: Partial<DecisionRecord> = {}): DecisionRecord {
  return {
    id,
    run: 'r1',
    date: '2026-11-01T10:01:00.000Z',
    subject: 'Spyro',
    phenomenon: 'modality',
    question: 'Does "cannot have" state a rule (normative), or that a PG game is unable to contain such a character (literal)?',
    options: [
      { label: 'A rule (normative)', consequence: 'A PG game with such a character breaks the rule.' },
      { label: 'Impossible (literal)', consequence: 'No PG game contains a character with a dark past at all.' },
    ],
    answer: { kind: 'option', option: 0 },
    answerText: 'A rule (normative)',
    scope: 'subject',
    affectedNodes: ['pg-no-dark-past'],
    decidedBy: 'user',
    wordedBy: 'agent',
    claudesGuess: { option: 0 },
    ...extra,
  };
}

const FAKE: Partial<SidecarCore> = fakeCodecs;

describe('AT4.8 the run sidecar store', () => {
  let tmp: string;
  let root: string;
  beforeEach(() => {
    tmp = makeTempDir('sidecars');
    root = copyMentalModel(tmp);
  });
  afterEach(() => cleanup(tmp));

  const attemptsFile = (): string => path.join(root, attemptsPath('Spyro'));
  const decisionsFile = (): string => path.join(root, decisionsPath('Spyro'));
  const tempFiles = (): string[] => readdirSync(path.join(root, '.telelean')).filter((name) => name.endsWith('.tmp'));

  it('appends one line per record (creating the subject dir), resolutions as lines, read back newest first with resolutions', async () => {
    const store = createRunSidecarStore({ core: FAKE });
    await store.appendAttempt(root, record('r1', 1, '2026-11-01T10:00:00.000Z'));
    expect(readFileSync(attemptsFile(), 'utf8')).toBe(`${JSON.stringify(record('r1', 1, '2026-11-01T10:00:00.000Z'))}\n`);
    await store.resolveAttempt(root, 'Spyro', resolution('r1', 1, 'superseded'));
    await store.appendAttempt(root, record('r1', 2, '2026-11-01T11:00:00.000Z', { verdict: 'not-proved' }));
    await store.resolveAttempt(root, 'Spyro', resolution('r1', 2, 'accepted'));
    const lines = readFileSync(attemptsFile(), 'utf8').split('\n');
    expect(lines).toHaveLength(5); // four lines and the final newline
    expect(lines.at(-1)).toBe('');
    const read = await store.readAttempts(root, 'Spyro');
    expect(read.map((a) => [a.id, a.verdict, a.resolution])).toEqual([
      ['r1.2', 'not-proved', 'accepted'],
      ['r1.1', 'proved', 'superseded'],
    ]);
    expect(await store.readAttempts(root, 'Other')).toEqual([]);
  });

  it('never joins a line to a hand-edited last line without a newline', async () => {
    const store = createRunSidecarStore({ core: FAKE });
    mkdirSync(path.dirname(attemptsFile()), { recursive: true });
    writeFileSync(attemptsFile(), JSON.stringify(record('r0', 1, '2026-10-31T10:00:00.000Z'))); // no final newline
    await store.appendAttempt(root, record('r1', 1, '2026-11-01T10:00:00.000Z'));
    expect((await store.readAttempts(root, 'Spyro')).map((a) => a.id)).toEqual(['r1.1', 'r0.1']);
  });

  it('concurrent appends never interleave: two stores in this process and another process at once', async () => {
    const a = createRunSidecarStore({ core: FAKE });
    const b = createRunSidecarStore({ core: FAKE });
    const long = 'x'.repeat(5000); // lines far longer than one pipe buffer's atomic guarantee would cover
    const child = path.join(tmp, 'appender.mjs');
    // Another writer (a second telelean window, say): plain O_APPEND writes of its own lines, in a separate process.
    writeFileSync(
      child,
      [
        "import { openSync, writeSync, closeSync } from 'node:fs';",
        'const [file, count] = process.argv.slice(2);',
        'for (let i = 0; i < Number(count); i++) {',
        "  const fd = openSync(file, 'a');",
        `  writeSync(fd, JSON.stringify({ format: 'telelean-attempt-resolution', version: 1, run: 'other', round: i, date: '2026-11-01T09:00:00.000Z', resolution: 'discarded', pad: '${'y'.repeat(3000)}' }) + '\\n');`,
        '  closeSync(fd);',
        '}',
      ].join('\n'),
    );
    mkdirSync(path.dirname(attemptsFile()), { recursive: true });
    const other = new Promise<number>((resolve, reject) => {
      const proc = spawn(process.execPath, [child, attemptsFile(), '150'], { stdio: 'ignore' });
      proc.on('error', reject);
      proc.on('exit', (code) => resolve(code ?? -1));
    });
    await Promise.all(
      Array.from({ length: 150 }, (_, i) => (i % 2 === 0 ? a : b).appendAttempt(root, record(`r${i}`, 1, `2026-11-01T10:${String(i % 60).padStart(2, '0')}:00.000Z`, { summary: long }))),
    );
    expect(await other).toBe(0);
    const lines = readFileSync(attemptsFile(), 'utf8').split('\n').filter((l) => l !== '');
    expect(lines).toHaveLength(300);
    const parsed = lines.map((l) => JSON.parse(l) as { format: string; run: string; summary?: string });
    expect(parsed.filter((p) => p.format === 'telelean-attempt').map((p) => p.run).sort()).toEqual(Array.from({ length: 150 }, (_, i) => `r${i}`).sort());
    expect(parsed.filter((p) => p.format === 'telelean-attempt').every((p) => p.summary === long)).toBe(true);
    expect(parsed.filter((p) => p.run === 'other')).toHaveLength(150);
  });

  it('decisions.json: read-modify-write replaced atomically through a temp file in .telelean/, same id replaced', async () => {
    const serialized: string[] = [];
    const store = createRunSidecarStore({
      core: {
        ...FAKE,
        serializeDecisionsFile: (file) => {
          const text = fakeCodecs.serializeDecisionsFile(file);
          serialized.push(text);
          return text;
        },
      },
    });
    await store.recordDecisions(root, 'Spyro', [decision('r1.q1.0')]);
    expect(readFileSync(decisionsFile(), 'utf8')).toBe(serialized[0]);
    expect((await store.readDecisions(root, 'Spyro')).decisions.map((d) => d.id)).toEqual(['r1.q1.0']);
    await store.recordDecisions(root, 'Spyro', [decision('r1.q1.0', { answerText: 'Impossible (literal)', answer: { kind: 'option', option: 1 } }), decision('r1.q2.0')]);
    const file = await store.readDecisions(root, 'Spyro');
    expect(file.decisions.map((d) => [d.id, d.answerText])).toEqual([
      ['r1.q1.0', 'Impossible (literal)'],
      ['r1.q2.0', 'A rule (normative)'],
    ]);
    expect(tempFiles()).toEqual([]);
    expect(readdirSync(path.dirname(decisionsFile())).sort()).toEqual(['decisions.json', 'layout.json']);
  });

  it('concurrent recordDecisions calls (two stores) never lose an update', async () => {
    const a = createRunSidecarStore({ core: FAKE });
    const b = createRunSidecarStore({ core: FAKE });
    await Promise.all(Array.from({ length: 20 }, (_, i) => (i % 2 === 0 ? a : b).recordDecisions(root, 'Spyro', [decision(`r1.q${i}.0`)])));
    const ids = (await a.readDecisions(root, 'Spyro')).decisions.map((d) => d.id).sort();
    expect(ids).toEqual(Array.from({ length: 20 }, (_, i) => `r1.q${i}.0`).sort());
    expect(tempFiles()).toEqual([]);
  });

  it('a failed decisions write leaves the previous file untouched and no temp file behind', async () => {
    const store = createRunSidecarStore({ core: FAKE });
    await store.recordDecisions(root, 'Spyro', [decision('r1.q1.0')]);
    const before = readFileSync(decisionsFile(), 'utf8');
    const failing = createRunSidecarStore({
      core: {
        ...FAKE,
        serializeDecisionsFile: () => {
          throw new Error('cannot serialise');
        },
      },
    });
    await expect(failing.recordDecisions(root, 'Spyro', [decision('r1.q2.0')])).rejects.toThrow('cannot serialise');
    expect(readFileSync(decisionsFile(), 'utf8')).toBe(before);
    // The rename itself fails (the target is a directory now): the temp file is removed.
    const other = path.join(root, decisionsPath('Second'));
    mkdirSync(other, { recursive: true });
    await expect(store.recordDecisions(root, 'Second', [decision('r1.q3.0', { subject: 'Second' })])).rejects.toThrow();
    expect(tempFiles()).toEqual([]);
  });

  it('refuses bad subjects and relative roots (nothing written outside the subject sidecar dir)', async () => {
    const store = createRunSidecarStore({ core: FAKE });
    await expect(store.appendAttempt(root, record('r1', 1, '2026-11-01T10:00:00.000Z', { subject: '../escape' }))).rejects.toThrow(TypeError);
    await expect(store.resolveAttempt(root, 'spyro lower', resolution('r1', 1, 'accepted'))).rejects.toThrow(TypeError);
    await expect(store.recordDecisions('relative/root', 'Spyro', [])).rejects.toThrow(TypeError);
    expect(readdirSync(path.join(root, '.telelean', 'subjects'))).toEqual(['Spyro']);
    expect(readdirSync(path.join(root, '.telelean', 'subjects', 'Spyro'))).toEqual(['layout.json']);
  });

  it('neither file is in a history snapshot or touched by Undo or a History revert', async () => {
    userGit(root, 'init', '-q');
    const store = createRunSidecarStore({ core: FAKE });
    const ws = createModelWorkspace({ root, text: fsTextSource(root), applier: recordingApplier(root), core: fakeWorkspaceCore, semantic: { enabled: false } });
    try {
      await ws.load();
      await store.appendAttempt(root, record('r1', 1, '2026-11-01T10:00:00.000Z'));
      await store.recordDecisions(root, 'Spyro', [decision('r1.q1.0')]);
      write(root, 'Model/Spyro/Inbox.lean', `${read(root, 'Model/Spyro/Inbox.lean')}-- a hand edit\n`); // forces a "Manual edits" snapshot
      await ws.invalidate(['Model/Spyro/Inbox.lean']); // what the extension's file watcher does
      expect((await ws.perform({ kind: 'add-node', subject: 'Spyro', type: 'AXIOM', naturalName: 'Spyro is a dragon' })).ok).toBe(true);
      const attempts = readFileSync(attemptsFile(), 'utf8');
      const decisions = readFileSync(decisionsFile(), 'utf8');
      const listing = await ws.listHistory('Spyro');
      expect(listing.entries.map((e) => e.action)).toEqual(['add-node', 'manual', 'initial']);
      for (const entry of listing.entries) {
        const tree = userGit(root, 'ls-tree', '--full-tree', '-r', '--name-only', entry.id).split('\n');
        expect(tree.filter((p) => p.endsWith('attempts.jsonl') || p.endsWith('decisions.json')), entry.label).toEqual([]);
      }
      expect((await ws.undo('Spyro')).ok).toBe(true);
      expect((await ws.revert('Spyro', listing.entries[2]?.id ?? '')).ok).toBe(true);
      expect(readFileSync(attemptsFile(), 'utf8')).toBe(attempts);
      expect(readFileSync(decisionsFile(), 'utf8')).toBe(decisions);
    } finally {
      ws.dispose();
    }
  });

  describe("WP1's codecs", () => {
    it('the real codecs: attempts round trip with resolutions newest first; decisions add and replace', async () => {
      const store = createRunSidecarStore();
      await store.appendAttempt(root, record('r1', 1, '2026-11-01T10:00:00.000Z'));
      await store.resolveAttempt(root, 'Spyro', resolution('r1', 1, 'superseded'));
      await store.appendAttempt(root, record('r1', 2, '2026-11-01T11:00:00.000Z', { verdict: 'not-proved' }));
      await store.resolveAttempt(root, 'Spyro', resolution('r1', 2, 'discarded'));
      const read = await store.readAttempts(root, 'Spyro');
      expect(read.map((a) => [a.id, a.verdict, a.resolution])).toEqual([
        ['r1.2', 'not-proved', 'discarded'],
        ['r1.1', 'proved', 'superseded'],
      ]);
      expect(read[1]).toMatchObject(record('r1', 1, '2026-11-01T10:00:00.000Z'));
      await store.recordDecisions(root, 'Spyro', [decision('r1.q1.0')]);
      await store.recordDecisions(root, 'Spyro', [decision('r1.q1.0', { answerText: 'Leave it open', answer: { kind: 'leave-open' } }), decision('r1.q2.0')]);
      const file = await store.readDecisions(root, 'Spyro');
      expect(file.format).toBe('telelean-decisions');
      expect(file.decisions.map((d) => [d.id, d.answerText])).toEqual([
        ['r1.q1.0', 'Leave it open'],
        ['r1.q2.0', 'A rule (normative)'],
      ]);
      expect(readFileSync(decisionsFile(), 'utf8').endsWith('}\n')).toBe(true);
    });
  });
});
