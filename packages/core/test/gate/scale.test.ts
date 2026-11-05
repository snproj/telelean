/**
 * The gate rules run on every check of a run: on a file with 2000 pinned cards they must stay well within a second
 * (no per-block rescans of the file).
 */
import { describe, expect, it } from 'vitest';
import { evaluateRules } from '../../src/gate/index.js';
import { parseLeanFile } from '../../src/markup/api.js';
import { buildProjectModel } from '../../src/project/index.js';

function bigMain(n: number, extra = ''): string {
  const lines = ['import Model.Big.Vocabulary', '', 'namespace Big', ''];
  for (let i = 0; i < n; i++) {
    lines.push('/-', '@@ telelean v1', `id: big-a-${i}`, 'type: ASSUMPTION', `natural_name: Big assumption number ${i}`, `rationale: r${i}`, `lean: Big.a${i}`, '-/');
    lines.push(`/-- Big assumption number ${i} -/`, `abbrev a${i} : Prop := P${i % 20} c${(i * 7) % 20}`, `axiom a${i}.holds : a${i}`, '');
  }
  lines.push('/-', '@@ telelean v1', 'id: big-goal', 'type: GOAL', 'natural_name: The big goal', 'lean: Big.goal', '-/', '/-- The big goal -/', 'abbrev goal : Prop := P0 c0', extra, 'end Big', '');
  return lines.join('\n');
}

describe('gate rules at scale', () => {
  it('evaluates a 2000-card project well within a second', () => {
    const vocab = ['namespace Big', 'axiom Thing : Type'];
    for (let j = 0; j < 20; j++) vocab.push(`axiom P${j} : Thing → Prop`, `noncomputable opaque c${j} : Thing`);
    vocab.push('end Big', '');
    const files = (main: string) => [parseLeanFile('Model/Big/Vocabulary.lean', vocab.join('\n')), parseLeanFile('Model/Big/Main.lean', main)];
    const base = buildProjectModel({ files: files(bigMain(2000)), fileHashes: {}, library: 'Model' });
    const current = buildProjectModel({ files: files(bigMain(2000, 'theorem goal.holds : goal := a0.holds')), fileHashes: {}, library: 'Model' });
    const started = performance.now();
    const report = evaluateRules({
      purpose: 'gate-other',
      stage: 'prove',
      selection: { subject: 'Big', target: 'big-goal', premises: ['big-a-0', 'big-a-1'], adoptedGhosts: [] },
      base,
      current,
      teleleanBlocks: [],
    });
    const ms = performance.now() - started;
    expect(report.declarations.added).toEqual(['Big.goal.holds']);
    expect(report.findings.map((f) => f.code)).toEqual(['status-mismatch']);
    expect(ms).toBeLessThan(1000);
  });
});
