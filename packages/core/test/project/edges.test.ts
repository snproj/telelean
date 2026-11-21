/**
 * AT2.11: verified edges come from Lean's references, not from footprints. A goal proved through a derivation
 * (`g2.holds := d0.holds.2`, whose `#print axioms` lists only d0's assumptions) gets the edge d0 -> g2; a proof through
 * an untracked lemma gets the edge from the node the lemma uses; D-13 mismatches are judged at the assumption level.
 */
import { describe, expect, it } from 'vitest';
import { kindChangeImpact, proofDependents } from '../../src/kindChange.js';
import { block, build, graphOf, mainS, nodeOf, VOCAB_S } from './helpers/build.js';

function derived(premisesOfG2: string[], extra = '') {
  const body = [
    block({ id: 'a1', type: 'ASSUMPTION', name: 'It is good', rationale: 'r', lean: 'S.a1' }),
    'abbrev a1 : Prop := Good t',
    'axiom a1.holds : a1',
    '',
    block({ id: 'a2', type: 'ASSUMPTION', name: 'It is bad', rationale: 'r', lean: 'S.a2' }),
    'abbrev a2 : Prop := Bad t',
    'axiom a2.holds : a2',
    '',
    block({ id: 'd0', type: 'DERIVATION', name: 'It is good and bad', premises: ['a1', 'a2'], lean: 'S.d0' }),
    'abbrev d0 : Prop := Good t ∧ Bad t',
    'theorem d0.holds : d0 := ⟨a1.holds, a2.holds⟩',
    '',
    block({ id: 'g2', type: 'GOAL', name: 'It is bad, again', premises: premisesOfG2, lean: 'S.g2' }),
    'abbrev g2 : Prop := Bad t',
    'theorem g2.holds : g2 := d0.holds.2',
    extra,
  ].join('\n');
  return build({ 'Model/S/Vocabulary.lean': VOCAB_S, 'Model/S/Main.lean': mainS(body) }, { facts: { overrides: { 'S.g2.holds': { extraRefs: ['And.right'] } } } });
}

describe('AT2.11 proofs through derivations and untracked lemmas', () => {
  it('g2.holds := d0.holds.2 gives the verified edge d0 -> g2, not the assumption edges, while the footprint lists the assumptions', () => {
    const { model, facts } = derived(['d0']);
    const g2Facts = facts?.decls.find((d) => d.name === 'S.g2.holds');
    expect(g2Facts?.refs.map((r) => r.name)).toEqual(['S.g2', 'S.d0.holds', 'And.right']);
    expect(g2Facts?.axioms).toEqual(['Classical.choice', 'S.Bad', 'S.Good', 'S.T', 'S.T.exists', 'S.a1.holds', 'S.a2.holds']);
    const g2 = nodeOf(model, 'g2');
    expect(g2.status.proof).toEqual({ kind: 'proved', footprint: ['a1', 'a2', 'presup:S.T.exists'] });
    const graph = graphOf(model);
    expect(graph.edges.filter((e) => e.type === 'verified').map((e) => e.id)).toEqual(['verified:a1->d0', 'verified:a2->d0', 'verified:d0->g2']);
    expect(graph.edges.some((e) => e.mismatch)).toBe(false);
    expect(model.diagnostics.filter((d) => d.code === 'TL107' || d.code === 'TL109')).toEqual([]);
  });

  it('proofDependents(d0) = [g2]: P->A on d0 says that g2\'s proof stays valid (an axiom of the same type)', () => {
    const graph = graphOf(derived(['d0']).model);
    expect(proofDependents(graph, 'd0')).toEqual(['g2']);
    expect(proofDependents(graph, 'a1')).toEqual(['d0', 'g2']);
    expect(kindChangeImpact(graph, 'd0', 'AXIOM')).toMatchObject({ needsConfirmation: false, dependents: ['g2'], leanChange: 'theorem-to-axiom' });
    expect(kindChangeImpact(graph, 'a1', 'PROPOSITION')).toMatchObject({ leanChange: 'pending', dependents: ['d0', 'g2'] });
  });

  it('a proof through an untracked lemma gives the edge from the node the lemma uses', () => {
    const extra = [
      '',
      'theorem helper : Good t := a1.holds',
      '',
      block({ id: 'g4', type: 'GOAL', name: 'It is good, again', premises: ['a1'], lean: 'S.g4' }),
      'abbrev g4 : Prop := Good t',
      'theorem g4.holds : g4 := helper',
    ].join('\n');
    const { model } = derived(['d0'], extra);
    const graph = graphOf(model);
    expect(graph.edges.filter((e) => e.target === 'g4')).toEqual([
      { id: 'premise:a1->g4', type: 'premise', source: 'a1', target: 'g4', origin: 'declared' },
      { id: 'verified:a1->g4', type: 'verified', source: 'a1', target: 'g4', origin: 'lean', where: 'proof' },
    ]);
    expect(model.vocabulary.find((v) => v.name === 'S.helper')?.kind).toBe('lemma');
  });

  it('mismatches: premises [d0] with a proof via d0: none; premises [a1] with a proof using a2: used-undeclared (TL107) and declared-unused (TL109)', () => {
    const viaD0 = graphOf(derived(['d0']).model);
    expect(viaD0.edges.filter((e) => e.target === 'g2' && e.mismatch)).toEqual([]);

    // Through the derivation of the declared premises: d0 stands for {a1, a2}. Spec v4.1 B.5 (slice 1d) removed the
    // coverage exemption: declaring a1 and a2 no longer excuses the use of d0, which needs its own arrow (TL107).
    const viaAssumptions = derived(['a1', 'a2']).model;
    expect(graphOf(viaAssumptions).edges.filter((e) => e.target === 'g2' && e.mismatch).map((e) => [e.id, e.mismatch])).toEqual([['verified:d0->g2', 'used-undeclared']]);
    expect(viaAssumptions.diagnostics.filter((d) => d.nodeId === 'g2').map((d) => d.code)).toEqual(['TL107']);

    const extra = [
      '',
      block({ id: 'g3', type: 'GOAL', name: 'Bad, from the wrong premise', premises: ['a1'], lean: 'S.g3' }),
      'abbrev g3 : Prop := Bad t',
      'theorem g3.holds : g3 := a2.holds',
    ].join('\n');
    const { model } = derived(['d0'], extra);
    const graph = graphOf(model);
    expect(graph.edges.find((e) => e.id === 'verified:a2->g3')?.mismatch).toBe('used-undeclared');
    expect(graph.edges.find((e) => e.id === 'premise:a1->g3')?.mismatch).toBe('declared-unused');
    expect(model.diagnostics.filter((d) => d.nodeId === 'g3').map((d) => [d.code, d.severity])).toEqual([
      ['TL107', 'warning'],
      ['TL109', 'hint'],
    ]);
  });

  it('an unproved goal\'s declared premises are never declared-unused', () => {
    const extra = ['', block({ id: 'g5', type: 'GOAL', name: 'Unproved', premises: ['a1', 'a2'], lean: 'S.g5' }), 'abbrev g5 : Prop := Good t ∧ Bad t'].join('\n');
    const graph = graphOf(derived(['d0'], extra).model);
    expect(graph.edges.filter((e) => e.target === 'g5')).toEqual([
      { id: 'premise:a1->g5', type: 'premise', source: 'a1', target: 'g5', origin: 'declared' },
      { id: 'premise:a2->g5', type: 'premise', source: 'a2', target: 'g5', origin: 'declared' },
    ]);
  });

  it('lean-ref edges: a statement mentioning another node\'s statement', () => {
    const extra = ['', block({ id: 'g6', type: 'GOAL', name: 'Both', premises: ['d0'], lean: 'S.g6' }), 'abbrev g6 : Prop := d0 ∧ a1'].join('\n');
    const graph = graphOf(derived(['d0'], extra).model);
    expect(graph.edges.filter((e) => e.type === 'lean-ref')).toEqual([
      { id: 'lean-ref:d0->g6', type: 'lean-ref', source: 'd0', target: 'g6', origin: 'lean', where: 'statement' },
      { id: 'lean-ref:a1->g6', type: 'lean-ref', source: 'a1', target: 'g6', origin: 'lean', where: 'statement' },
    ]);
    // ... and its uses come through those statements (breadth-first).
    expect(graph.nodes.find((n) => n.id === 'g6')?.lean.uses).toEqual(['S.Good', 'S.t', 'S.Bad']);
  });
});
