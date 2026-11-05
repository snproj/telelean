/**
 * D-11 with conditional proofs (`theorem d.holds (h : a) : d`, as the A->G rewrite produces them) and the reference
 * forms Lean records (`@H`, a duplicate ref with and without `@`, a ref with its parentheses), with WP-markup's real
 * parser and primitives and facts derived from the texts (fakeFacts). The same sequence is checked with real Lean in
 * packages/runner/test/integration/conditional.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { ActionError, type EditPlan } from '../../src/actions.js';
import { planAction, type PlanContext } from '../../src/edit/index.js';
import { kindChangeImpact } from '../../src/kindChange.js';
import { parseLeanFile } from '../../src/markup/api.js';
import type { LeanFacts } from '../../src/facts.js';
import { buildProjectModel, subjectGraph, type ProjectModel } from '../../src/project/index.js';
import { LineMap } from '../../src/project/text.js';
import { fakeFacts, freshHashes } from '../project/helpers/fakeFacts.js';
import { block, mainS, VOCAB_S } from '../project/helpers/build.js';
import { confirmedAction } from './helpers/confirm.js';

const CTX: PlanContext = { today: '2026-11-02', now: '2026-11-02T10:00:00.000Z', layouts: {} };
const MAIN = 'Model/S/Main.lean';

/** After "A->G on a1 with rewrite": d1 and g1 take `(h_a1 : a1)`; g1 applies d1's proof to it. */
const BODY = [
  block({ id: 'a1', type: 'GOAL', name: 'A1', lean: 'S.a1' }),
  'abbrev a1 : Prop := Good t',
  '',
  block({ id: 'd1', type: 'DERIVATION', name: 'D1', lean: 'S.d1' }),
  'abbrev d1 : Prop := Good t ∧ Good t',
  'theorem d1.holds (h_a1 : a1) : d1 := ⟨h_a1, h_a1⟩',
  '',
  block({ id: 'g1', type: 'GOAL', name: 'G1', lean: 'S.g1' }),
  'abbrev g1 : Prop := Good t',
  'theorem g1.holds (h_a1 : a1) : g1 := (d1.holds h_a1).2',
].join('\n');

function model(body = BODY, mutate?: (facts: LeanFacts, text: string) => void): ProjectModel {
  const texts = { 'Model/S/Vocabulary.lean': VOCAB_S, [MAIN]: mainS(body) };
  const files = Object.entries(texts).map(([path, text]) => parseLeanFile(path, text));
  const facts = fakeFacts(files);
  mutate?.(facts, texts[MAIN]);
  return buildProjectModel({ files, fileHashes: freshHashes(files), facts, library: 'Model' });
}

function refusal(fn: () => unknown): ActionError {
  try {
    fn();
  } catch (error) {
    if (error instanceof ActionError) return error;
    throw error;
  }
  throw new Error('expected an ActionError');
}

const mainAfter = (plan: EditPlan) => plan.changes.find((c) => c.path === MAIN)?.after ?? '';

describe('D-11 on a conditional derivation (its proof takes the hypothesis h_a1)', () => {
  it('the board sees d1 as conditional on a1 and the verified arrow d1 -> g1', () => {
    const graph = subjectGraph(model(), 'S', { version: 1, semantic: { state: 'fresh' } });
    expect(graph.nodes.find((n) => n.id === 'd1')?.status.proof).toMatchObject({ kind: 'conditional', on: ['a1'] });
    expect(graph.edges.some((e) => e.type === 'verified' && e.source === 'd1' && e.target === 'g1')).toBe(true);
  });

  it('the D->A drop zone does not promise that the proofs using it stay valid: it asks', () => {
    const graph = subjectGraph(model(), 'S', { version: 1, semantic: { state: 'fresh' } });
    const impact = kindChangeImpact(graph, 'd1', 'ASSUMPTION');
    expect(impact).toMatchObject({ needsConfirmation: true, dependents: ['g1'], summary: 'Make Assumption: 1 dependent needs a rewrite' });
    expect(impact.detail).toContain('takes a hypothesis; as an assumption it becomes `axiom d1.holds : d1`');
    expect(impact.detail).not.toContain('stays valid');
  });

  it('D->A without a choice needs confirmation, listing the proofs that apply it', () => {
    const error = refusal(() => planAction(model(), { kind: 'change-kind', id: 'd1', to: 'ASSUMPTION', beforeId: null }, CTX));
    expect(error.code).toBe('needs-confirmation');
    expect(error.dependents).toEqual(['g1']);
    expect(error.message).toMatch(/d1\.holds takes a hypothesis, but as an assumption it becomes `axiom d1\.holds : d1`/);
  });

  it('D->A with "rewrite" drops the arguments where the proof is applied, and archives the proof', () => {
    const plan = planAction(model(), confirmedAction(model(), { kind: 'change-kind', id: 'd1', to: 'ASSUMPTION', beforeId: null, dependents: 'rewrite' }), CTX);
    expect(plan.label).toBe('Make Assumption: D1 (dependents rewritten)');
    const text = mainAfter(plan);
    expect(text).toContain('abbrev d1 : Prop := Good t ∧ Good t\naxiom d1.holds : d1\n');
    expect(text).toContain('theorem g1.holds (h_a1 : a1) : g1 := d1.holds.2');
    expect(plan.archive?.map((a) => a.text)).toEqual(['theorem d1.holds (h_a1 : a1) : d1 := ⟨h_a1, h_a1⟩']);
  });

  it('D->A with "mark broken" only turns the proof into the axiom', () => {
    const plan = planAction(model(), confirmedAction(model(), { kind: 'change-kind', id: 'd1', to: 'ASSUMPTION', beforeId: null, dependents: 'mark-broken' }), CTX);
    expect(plan.label).toBe('Make Assumption: D1 (dependents marked broken)');
    expect(mainAfter(plan)).toContain('axiom d1.holds : d1\n');
    expect(mainAfter(plan)).toContain('(d1.holds h_a1).2');
  });

  it('D->G with "rewrite" replaces each whole application `(d1.holds h_a1)` by the new hypothesis h_d1 : d1', () => {
    const plan = planAction(model(), confirmedAction(model(), { kind: 'change-kind', id: 'd1', to: 'GOAL', beforeId: null, dependents: 'rewrite' }), CTX);
    const text = mainAfter(plan);
    expect(text).toContain('theorem g1.holds (h_d1 : d1) (h_a1 : a1) : g1 := h_d1.2');
    expect(text).not.toContain('d1.holds');
  });

  it('a use that is not applied to all its hypotheses in parentheses is refused (choose "mark broken")', () => {
    const body = BODY.replace('(d1.holds h_a1).2', 'And.right (d1.holds h_a1)').replace('theorem g1.holds (h_a1 : a1) : g1 :=', 'theorem g1.holds (h_a1 : a1) : g1 :=\n  have k := d1.holds\n ');
    const error = refusal(() => planAction(model(body), confirmedAction(model(body), { kind: 'change-kind', id: 'd1', to: 'ASSUMPTION', beforeId: null, dependents: 'rewrite' }), CTX));
    expect(error.code).toBe('unsafe');
    expect(error.message).toMatch(/is not applied to its 1 hypothesis in parentheses .*choose "mark broken" instead/);
  });

  it('without dependents, D->A just turns the conditional proof into the axiom', () => {
    const body = BODY.replace('theorem g1.holds (h_a1 : a1) : g1 := (d1.holds h_a1).2', '');
    const plan = planAction(model(body), { kind: 'change-kind', id: 'd1', to: 'ASSUMPTION', beforeId: null }, CTX);
    expect(mainAfter(plan)).toContain('axiom d1.holds : d1\n');
  });

  it('a lemma without a card that applies it: the drop zone says only that no card uses it, and the host asks', () => {
    const body = BODY.replace('theorem g1.holds (h_a1 : a1) : g1 := (d1.holds h_a1).2', 'theorem helper_d (h : a1) : d1 := (d1.holds h)');
    const graph = subjectGraph(model(body), 'S', { version: 1, semantic: { state: 'fresh' } });
    const impact = kindChangeImpact(graph, 'd1', 'ASSUMPTION');
    expect(impact).toMatchObject({ needsConfirmation: false, dependents: [] });
    expect(impact.detail).toMatch(/the proof is kept in the attic\. No card on this board uses it\.$/);
    const error = refusal(() => planAction(model(body), { kind: 'change-kind', id: 'd1', to: 'ASSUMPTION', beforeId: null }, CTX));
    expect(error.code).toBe('needs-confirmation');
    expect(error.dependents).toEqual(['S.helper_d']);
  });
});

describe('D-11 rewrite with the reference forms Lean records', () => {
  const PLAIN = [
    block({ id: 'a1', type: 'ASSUMPTION', name: 'A1', rationale: 'r', lean: 'S.a1' }),
    'abbrev a1 : Prop := Good t',
    'axiom a1.holds : a1',
    '',
    'theorem lem5 : Good t := a1.holds',
    'theorem lem4 : Good t := @lem5',
    'theorem lem3 : Good t := (lem5)',
    'theorem lem2 : Good t := @a1.holds',
  ].join('\n');

  /** Lean's refs: `@lem5` twice (with and without `@`), `(lem5)` with its parentheses, `@a1.holds` with its `@`. */
  const leanLike = (facts: LeanFacts, text: string) => {
    const map = new LineMap(text);
    const span = (needle: string, from = 0) => {
      const start = text.indexOf(needle, from);
      return { start: map.positionAt(start), end: map.positionAt(start + needle.length) };
    };
    const set = (decl: string, refs: Array<{ name: string; needle: string; from?: string }>) => {
      const facts1 = facts.decls.find((d) => d.name === decl);
      if (!facts1) throw new Error(`no facts for ${decl}`);
      facts1.refs = refs.map((r) => ({ name: r.name, module: 'Model.S.Main', range: span(r.needle, r.from ? text.indexOf(r.from) : 0) }));
    };
    set('S.lem4', [
      { name: 'S.lem5', needle: '@lem5', from: 'theorem lem4' },
      { name: 'S.lem5', needle: 'lem5', from: 'theorem lem4 : Good t := @' },
    ]);
    set('S.lem3', [{ name: 'S.lem5', needle: '(lem5)', from: 'theorem lem3' }]);
    set('S.lem2', [{ name: 'S.a1.holds', needle: '@a1.holds', from: 'theorem lem2' }]);
  };

  it('A->G "rewrite" handles `@H`, a duplicated `@c` ref and a parenthesised `(c)` ref', () => {
    const plan = planAction(model(PLAIN, leanLike), confirmedAction(model(PLAIN, leanLike), { kind: 'change-kind', id: 'a1', to: 'GOAL', beforeId: null, dependents: 'rewrite' }), CTX);
    const text = mainAfter(plan);
    expect(text).toContain('theorem lem5 (h_a1 : a1) : Good t := h_a1');
    expect(text).toContain('theorem lem4 (h_a1 : a1) : Good t := (@lem5 h_a1)');
    expect(text).toContain('theorem lem3 (h_a1 : a1) : Good t := ((lem5 h_a1))');
    expect(text).toContain('theorem lem2 (h_a1 : a1) : Good t := h_a1');
    expect(text).not.toContain('axiom a1.holds');
  });
});
