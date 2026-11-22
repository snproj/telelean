/**
 * Slice 2f (docs/slice2-plan.md 2.6, 3.10 step 4, D2-18, EN-3, coverage audit G1): what an edit session's Apply asks of
 * the ModelWorkspace, with the real core on a scratch copy of mental_model/ in a scratch git repository:
 *   - `applyChanges` accepts, besides model files, exactly the set's subject's `layout.json` and `endorsements.json`
 *     (one history entry of kind `accept-proposal`, one Undo step), and still refuses every other file;
 *   - the workspace reads `endorsements.json` (on load, when it changes, after an Apply or its Undo) and passes it to the
 *     build, which stops flagging an endorsed definition whose text is unchanged ("needs your endorsement"); a changed
 *     text flags again; the Apply's Undo removes the endorsements, puts the moved cards back, and the flag returns;
 *   - History's entry for the Apply holds Claude's arrows (`HistoryEntry.arrows`, from its `Telelean-Arrow` trailers).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { endorsementHash, endorsementsPath, layoutPath, parseLayout, parseLeanFile, REVIEW_TEXTS, serializeEndorsements, serializeLayout, type ArrowProvenance, type LeanFacts } from '@telelean/core';

import { fakeFacts } from '../../../core/test/project/helpers/fakeFacts.js';
import type { RefreshRequest } from '../../src/semantic/types.js';
import { listModelFiles } from '../../src/workspace/files.js';

import { entryFromMessage, snapshotMessage } from '../../src/workspace/history.js';
import { createModelWorkspace, fsEditApplier, fsTextSource, type ModelWorkspace } from '../../src/workspace/index.js';
import { isSubjectSidecarFile } from '../../src/workspace/files.js';
import { cleanup, copyMentalModel, exists, makeTempDir, read, userGit, write } from './helpers.js';

const VOCAB = 'Model/Spyro/Vocabulary.lean';
const MAIN = 'Model/Spyro/Main.lean';
const DEF = '/-- strict about ratings -/\ndef Unforgiving (g : Game) : Prop := IsPG g\n';

/** The Lean facts of the files on disk now (core's fake facts: refs, value and type constants; no Lean runs). */
async function diskFacts(request: RefreshRequest): Promise<LeanFacts> {
  const files = await listModelFiles(request.root, request.library ?? 'Model');
  const parsed = files.filter((rel) => rel.endsWith('.lean')).map((rel) => parseLeanFile(rel, readFileSync(path.join(request.root, rel), 'utf8')));
  return fakeFacts(parsed, { library: request.library ?? 'Model', valueConsts: true, typeConsts: true, probe: 'ok' });
}

describe('an edit session\'s Apply in the workspace (2f)', () => {
  let tmp: string;
  let root: string;
  let ws: ModelWorkspace | undefined;

  beforeEach(async () => {
    tmp = makeTempDir('sessionApply');
    root = copyMentalModel(tmp);
    // A definition a card's statement uses: the card and the definition need the person's endorsement (BD-1).
    write(root, VOCAB, read(root, VOCAB).replace('\nend Spyro', `\n${DEF}\nend Spyro`));
    write(root, MAIN, read(root, MAIN).replace('abbrev new_spyro_pg : Prop := IsPG newSpyro', 'abbrev new_spyro_pg : Prop := Unforgiving newSpyro'));
    userGit(root, 'init', '-q');
    ws = createModelWorkspace({ root, text: fsTextSource(root), applier: fsEditApplier(root), semantic: { enabled: true, debounceMs: 1 }, refreshFacts: diskFacts, now: () => new Date('2026-11-21T10:00:00Z') });
    await ws.load();
    await ws.refreshNow();
  });
  afterEach(() => {
    ws?.dispose();
    ws = undefined;
    cleanup(tmp);
  });

  /** The definition's "needs your endorsement" flag, after the Lean refresh the change asked for. */
  const flagged = async (w: ModelWorkspace): Promise<boolean> => {
    await w.refreshNow();
    return w.graph('Spyro').vocabulary.find((v) => v.name === 'Spyro.Unforgiving')?.flags.includes('definitional-choice') === true;
  };
  const code = (w: ModelWorkspace): string => w.projectModel().vocabulary.find((v) => v.name === 'Spyro.Unforgiving')?.code ?? '';

  it('Apply\'s change set with the two sidecars is one history entry and one Undo step; the endorsement stops the flag, Undo brings back B, the layout and the flag', async () => {
    const w = ws as ModelWorkspace;
    expect(await flagged(w)).toBe(true);
    const main = read(root, MAIN);
    const layoutBefore = read(root, layoutPath('Spyro'));
    const positions = { ...(parseLayout(layoutBefore).positions ?? {}), 'cynder-not-good': { x: 321, y: 123 } };
    const endorsements = serializeEndorsements({ format: 'telelean-endorsements', version: 1, endorsed: [{ name: 'Spyro.Unforgiving', textHash: endorsementHash(code(w)), run: 'r1', date: '2026-11-21' }] });
    const arrows: ArrowProvenance[] = [
      { source: 'cynder-dark-past', target: 'cynder-not-good', step: 's1', kind: 'arrow' },
      { source: 'a-new-premise', target: 'cynder-not-good', step: 's2', kind: 'premise' },
    ];
    const label = REVIEW_TEXTS.applyLabel(['Cynder would not be a good addition to the new…']);
    const outcome = await w.applyChanges({
      label,
      action: 'accept-proposal',
      subject: 'Spyro',
      nodes: ['cynder-not-good'],
      changes: [
        { path: MAIN, before: main, after: `${main}-- applied\n` },
        { path: endorsementsPath('Spyro'), before: null, after: endorsements },
        { path: layoutPath('Spyro'), before: layoutBefore, after: serializeLayout({ ...parseLayout(layoutBefore), positions }) },
      ],
      arrows,
    });
    expect(outcome).toEqual({ ok: true, label, undoable: true });
    expect(read(root, endorsementsPath('Spyro'))).toBe(endorsements);
    // The workspace read the endorsements back (the Apply re-reads what it wrote): the build stops flagging.
    expect(await flagged(w)).toBe(false);
    // One history entry, of M2's kind, with its label and Claude's arrows; one Undo step.
    const listing = await w.listHistory('Spyro');
    expect(listing.entries[0]).toMatchObject({ action: 'accept-proposal', label, arrows });
    expect(listing.entries.filter((e) => e.action === 'accept-proposal')).toHaveLength(1);
    expect((await w.workspaceState('Spyro')).undo).toBe(label);
    // The history's preview of the entry covers the sidecars (isSubjectSidecarFile).
    const diff = await w.historyDiff('Spyro', listing.entries[0]?.id ?? '', 'parent');
    expect(diff.files.map((f) => f.path).sort()).toEqual([endorsementsPath('Spyro'), layoutPath('Spyro'), MAIN].sort());
    // Undo of the Apply: B again, no endorsements, the moved card back, and the flag returns.
    expect(await w.undo('Spyro')).toMatchObject({ ok: true, label: `Undo: ${label}` });
    expect(read(root, MAIN)).toBe(main);
    expect(exists(root, endorsementsPath('Spyro'))).toBe(false);
    expect(read(root, layoutPath('Spyro'))).toBe(layoutBefore);
    expect(await flagged(w)).toBe(true);
  });

  it('an endorsed definition whose text changes is flagged again (the hash compares the text), and a hand edit of the file is read', async () => {
    const w = ws as ModelWorkspace;
    write(root, endorsementsPath('Spyro'), serializeEndorsements({ format: 'telelean-endorsements', version: 1, endorsed: [{ name: 'Spyro.Unforgiving', textHash: endorsementHash(code(w)), run: 'r1', date: '' }] }));
    await w.invalidate([endorsementsPath('Spyro')]);
    expect(await flagged(w)).toBe(false);
    // Re-indented: still endorsed (whitespace collapsed); another body: flagged again.
    write(root, VOCAB, read(root, VOCAB).replace('def Unforgiving (g : Game) : Prop := IsPG g', 'def Unforgiving (g : Game) : Prop :=\n  IsPG g'));
    await w.invalidate([VOCAB]);
    expect(await flagged(w)).toBe(false);
    write(root, VOCAB, read(root, VOCAB).replace('IsPG g', '¬ IsPG g'));
    await w.invalidate([VOCAB]);
    expect(await flagged(w)).toBe(true);
    // The file removed by hand: nothing endorsed.
    write(root, VOCAB, read(root, VOCAB).replace('¬ IsPG g', 'IsPG g'));
    await w.invalidate([VOCAB]);
    expect(await flagged(w)).toBe(false);
    write(root, endorsementsPath('Spyro'), 'not json');
    await w.invalidate([endorsementsPath('Spyro')]);
    expect(await flagged(w)).toBe(true);
  });

  it('a fresh workspace reads the endorsements on load', async () => {
    const w = ws as ModelWorkspace;
    write(root, endorsementsPath('Spyro'), serializeEndorsements({ format: 'telelean-endorsements', version: 1, endorsed: [{ name: 'Spyro.Unforgiving', textHash: endorsementHash(code(w)), run: 'r1', date: '' }] }));
    w.dispose();
    ws = createModelWorkspace({ root, text: fsTextSource(root), applier: fsEditApplier(root), semantic: { enabled: true, debounceMs: 1 }, refreshFacts: diskFacts });
    await ws.load();
    expect(await flagged(ws)).toBe(false);
  });

  it('applyChanges still refuses every other file that is not a model file: another subject\'s sidecars, decisions.json, attempts.jsonl, the attic, graph.json', async () => {
    const w = ws as ModelWorkspace;
    for (const p of ['.telelean/subjects/Other/layout.json', '.telelean/subjects/Other/endorsements.json', '.telelean/subjects/Spyro/decisions.json', '.telelean/subjects/Spyro/attempts.jsonl', '.telelean/subjects/Spyro/attic/x.lean', '.telelean/graph.json', 'notes.txt']) {
      const was = exists(root, p) ? read(root, p) : null;
      expect(await w.applyChanges({ label: 'x', action: 'accept-proposal', subject: 'Spyro', nodes: [], changes: [{ path: p, before: was, after: '{}' }] }), p).toMatchObject({ ok: false, code: 'unsafe' });
      expect(exists(root, p) ? read(root, p) : null, p).toBe(was);
    }
  });
});

describe('History\'s provenance trailers (G1)', () => {
  it('an Apply\'s arrows round-trip through its commit message; other entries and old ones have none; a malformed trailer is skipped', () => {
    const arrows: ArrowProvenance[] = [
      { source: 'a', target: 't', step: 's1', kind: 'arrow' },
      { source: 'p-card', target: 't', step: 's3', kind: 'premise' },
    ];
    const message = snapshotMessage({ label: 'Apply: Formalize for dependencies → T', action: 'accept-proposal', subject: 'Spyro', nodes: ['t'], arrows });
    expect(message).toContain('Telelean-Arrow: arrow s1 a t\nTelelean-Arrow: premise s3 p-card t\n');
    expect(entryFromMessage('c1', '2026-11-21T10:00:00Z', message, 'Spyro').arrows).toEqual(arrows);
    expect(entryFromMessage('c2', '2026-11-21T10:00:00Z', snapshotMessage({ label: 'Move', action: 'move-cards', subject: 'Spyro', nodes: [] }), 'Spyro').arrows).toBeUndefined();
    expect(entryFromMessage('c3', '2026-11-21T10:00:00Z', 'Old\n\nTelelean-Action: accept-proposal\nTelelean-Arrow: arrow s1\n', 'Spyro').arrows).toBeUndefined();
    // A part with whitespace is never written (card and step ids have none).
    expect(snapshotMessage({ label: 'x', action: 'accept-proposal', subject: 'Spyro', nodes: [], arrows: [{ source: 'a b', target: 't', step: 's1', kind: 'arrow' }] })).not.toContain('Telelean-Arrow');
  });

  it('isSubjectSidecarFile covers endorsements.json (its history and Undo), and only the subject\'s own', () => {
    expect(isSubjectSidecarFile('.telelean/subjects/Spyro/endorsements.json', 'Spyro')).toBe(true);
    expect(isSubjectSidecarFile('.telelean/subjects/Other/endorsements.json', 'Spyro')).toBe(false);
    expect(isSubjectSidecarFile('.telelean/subjects/Spyro/decisions.json', 'Spyro')).toBe(false);
    expect(isSubjectSidecarFile('.telelean/subjects/Spyro/layout.json', 'Spyro')).toBe(true);
  });
});
