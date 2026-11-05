/**
 * The model is rebuilt after every typing pause and twice per board action, on the extension host: it must stay
 * linear in the number of cards of a file (it was quadratic: every pinned block re-scanned the text before it).
 * Generous bound: before the fix, 1600 pinned cards in one file took 6.2 s (the verifier's measurement, about x4 per
 * doubling); now 2000 take tens of milliseconds.
 */
import { describe, expect, it } from 'vitest';
import { parseLeanFile } from '../../src/markup/api.js';
import { buildProjectModel, subjectGraph } from '../../src/project/index.js';

function bigMain(n: number): string {
  const lines = ['import Model.Big.Vocabulary', '', 'namespace Big', ''];
  for (let i = 0; i < n; i++) {
    lines.push('/-', '@@ telelean v1', `id: big-a-${i}`, 'type: ASSUMPTION', `natural_name: Big assumption number ${i}`, `rationale: r${i}`, `lean: Big.a${i}`, '-/');
    lines.push(`/-- Big assumption number ${i} -/`, `abbrev a${i} : Prop := P${i % 20} c${(i * 7) % 20}`, `axiom a${i}.holds : a${i}`, '');
  }
  lines.push('end Big', '');
  return lines.join('\n');
}

describe('scale', () => {
  it('builds the model of a file with 2000 pinned cards well within a second', () => {
    const vocab = ['namespace Big', 'axiom Thing : Type'];
    for (let j = 0; j < 20; j++) vocab.push(`axiom P${j} : Thing → Prop`, `noncomputable opaque c${j} : Thing`);
    vocab.push('end Big', '');
    const files = [parseLeanFile('Model/Big/Vocabulary.lean', vocab.join('\n')), parseLeanFile('Model/Big/Main.lean', bigMain(2000))];
    const started = performance.now();
    const model = buildProjectModel({ files, fileHashes: {}, library: 'Model' });
    const graph = subjectGraph(model, 'Big', { version: 1, semantic: { state: 'unavailable' } });
    const ms = performance.now() - started;
    expect(graph.nodes).toHaveLength(2000);
    expect(graph.nodes[1999]?.lean.statement).toBe('Big.a1999');
    expect(ms).toBeLessThan(1500);
  });
});
