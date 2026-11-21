/**
 * Lean round-trip of the markup escapes (docs/m1-plan.md section 11.4; D-8, FV-5): sentences with comment delimiters,
 * quotes, backslashes and a leading `--` are written by the board's own actions (add-node: renderBlock; edit-node on
 * a formalised card: setBlockField plus the D-9 docstring mirror through set-docstring), then the scratch copy is
 * built by Lean 4.35 under runLean: the build must succeed and the re-parsed cards must carry the exact sentences.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createModelWorkspace, fsEditApplier, fsTextSource, type ModelWorkspace } from '../../src/workspace/index.js';
import { cleanup, copyMentalModel, makeTempDir, read, waitForMemory } from '../workspace/helpers.js';

const SENTENCES = [
  'This sentence ends a comment -/ too early',
  'This one opens /- a nested comment',
  'Mixed /-/ and -/- and "double quotes"',
  '"Starts with a quote',
  '-- starts like a line comment',
  'A back\\slash, a tab\tand a colon: here',
];
const DOCSTRING_SENTENCE = 'Cynder -/ has /- a "dark" past -- really';

describe('markup escapes survive a Lean build (plan 11.4)', () => {
  let tmp: string;
  let root: string;
  let ws: ModelWorkspace;

  beforeAll(async () => {
    tmp = makeTempDir('itg-escapes');
    root = copyMentalModel(tmp);
    ws = createModelWorkspace({ root, text: fsTextSource(root), applier: fsEditApplier(root), semantic: { enabled: true, debounceMs: 60_000 }, git: { enabled: false } });
    await ws.load();
  });

  afterAll(() => {
    ws?.dispose();
    cleanup(tmp);
  });

  it('add-node and a docstring-mirrored edit with delimiters build with Lean and re-parse to the same sentences', async (ctx) => {
    if (!(await waitForMemory())) ctx.skip(); // RAM rule: never build below 12 GB available
    const ids: string[] = [];
    for (const sentence of SENTENCES) {
      const outcome = await ws.perform({ kind: 'add-node', subject: 'Spyro', type: 'AXIOM', naturalName: sentence, rationale: `why: ${sentence}` });
      expect(outcome, JSON.stringify(outcome)).toMatchObject({ ok: true });
      if (outcome.ok && outcome.nodeId) ids.push(outcome.nodeId);
    }
    expect(ids).toHaveLength(SENTENCES.length);
    const edited = await ws.perform({ kind: 'edit-node', id: 'cynder-dark-past', field: 'naturalName', value: DOCSTRING_SENTENCE });
    expect(edited, JSON.stringify(edited)).toMatchObject({ ok: true });
    const main = read(root, 'Model/Spyro/Main.lean');
    expect(main).toContain('/-- Cynder -\\/ has /\\- a "dark" past -- really -/\nabbrev cynder_dark_past');

    const summary = await ws.refreshNow();
    expect(summary.state, JSON.stringify(summary)).toBe('fresh');
    const graph = ws.graph('Spyro');
    expect(graph.diagnostics.filter((d) => d.code === 'LEAN' || d.code === 'TL001' || d.code === 'TL010')).toEqual([]);
    for (const [i, id] of ids.entries()) {
      const node = graph.nodes.find((n) => n.id === id);
      expect(node?.naturalName, id).toBe(SENTENCES[i]);
      expect(node?.rationale, id).toBe(`why: ${SENTENCES[i]}`);
    }
    const dark = graph.nodes.find((n) => n.id === 'cynder-dark-past');
    expect(dark?.naturalName).toBe(DOCSTRING_SENTENCE);
    expect(dark?.status.proof.kind).toBe('assumed');
    expect(graph.nodes).toHaveLength(4 + SENTENCES.length);
  });
});
