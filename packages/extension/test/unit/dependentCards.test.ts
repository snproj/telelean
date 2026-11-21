/**
 * The delete question across subjects, with the real runner workspace and core on a scratch copy of mental_model/
 * (Lean checking and git history off; no VS Code): a card of another subject whose Lean uses the card's code is named
 * in the host's `needs-confirmation` answer by its subject, kind and sentence (`dependentCards`), so the board can
 * show it by its sentence; a lemma without a card stays a Lean name.
 */
import { parseWebviewToHost, type WebviewToHostMessage } from '@telelean/core';
import { createModelWorkspace, fsEditApplier, fsTextSource, type ModelWorkspace } from '@telelean/runner/workspace/index.js';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { BoardSession } from '../../src/logic/boardSession';
import { RecordingPorts } from './fakes';

const SAMPLE = fileURLToPath(new URL('../../../../mental_model', import.meta.url));

function message(type: string, payload: Record<string, unknown>): WebviewToHostMessage {
  const parsed = parseWebviewToHost({ v: 1, type, payload });
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.value;
}

describe('needs-confirmation across subjects (real workspace and core)', () => {
  let tmp: string;
  let root: string;
  let ws: ModelWorkspace;

  beforeAll(async () => {
    tmp = mkdtempSync(path.join(process.env.TELELEAN_TEST_TMP ?? tmpdir(), 'tl-dependent-cards-'));
    root = path.join(tmp, 'model');
    // The sample's text only (no build output, repository or graph.json), as the smoke tests copy it.
    cpSync(SAMPLE, root, { recursive: true, filter: (src) => !path.relative(SAMPLE, src).split(path.sep).some((part) => ['.lake', '.git', 'graph.json'].includes(part)) });
    ws = createModelWorkspace({ root, text: fsTextSource(root), applier: fsEditApplier(root), semantic: { enabled: false }, git: { enabled: false } });
    await ws.load();
    const created = await ws.perform({ kind: 'create-subject', name: 'Bayonetta' });
    expect(created.ok, JSON.stringify(created)).toBe(true);
    // A card of Bayonetta whose statement and proof use Spyro's cynder_dark_past, and a lemma without a card.
    const main = path.join(root, 'Model', 'Bayonetta', 'Main.lean');
    const card = [
      '/-',
      '@@ telelean v1',
      'id: rival-dark-past',
      'type: PROPOSITION',
      "natural_name: Bayonetta's rival has a dark past too",
      'lean: Bayonetta.rival_dark_past',
      '-/',
      'abbrev rival_dark_past : Prop := Spyro.cynder_dark_past',
      'theorem rival_dark_past.holds : rival_dark_past := Spyro.cynder_dark_past.holds',
      '',
      'theorem dark_lemma : Spyro.cynder_dark_past := Spyro.cynder_dark_past.holds',
      '',
    ].join('\n');
    const text = readFileSync(main, 'utf8');
    expect(text).toMatch(/\nend Bayonetta\n$/);
    writeFileSync(main, `import Model.Spyro.Main\n${text.replace(/\nend Bayonetta\n$/, `\n${card}\nend Bayonetta\n`)}`);
    await ws.invalidate(['Model/Bayonetta/Main.lean']);
    expect(ws.graph('Bayonetta').nodes.map((n) => n.id)).toEqual(['rival-dark-past']);
  });

  afterAll(() => {
    ws?.dispose();
    if (tmp) rmSync(tmp, { recursive: true, force: true });
  });

  it("names the other subject's card by subject, kind and sentence; the lemma stays a Lean name; nothing is deleted", async () => {
    const ports = new RecordingPorts();
    const session = new BoardSession({ root, rootName: 'model', workspace: ws, subject: 'Spyro', ports });
    const before = readFileSync(path.join(root, 'Model', 'Spyro', 'Main.lean'), 'utf8');
    await session.handle(message('deleteNode', { id: 'cynder-dark-past', keepLean: false, requestId: 'r1' }));
    const outcome = ports.of('actionResult')[0]?.payload.outcome;
    expect(outcome).toMatchObject({ ok: false, code: 'needs-confirmation' });
    if (!outcome || outcome.ok) throw new Error('expected a refusal');
    expect(outcome.dependents).toEqual(['rival-dark-past', 'Bayonetta.dark_lemma']);
    expect(outcome.dependentCards).toEqual({
      'rival-dark-past': { subject: 'Bayonetta', type: 'PROPOSITION', naturalName: "Bayonetta's rival has a dark past too" },
    });
    expect(readFileSync(path.join(root, 'Model', 'Spyro', 'Main.lean'), 'utf8')).toBe(before);
  });
});
