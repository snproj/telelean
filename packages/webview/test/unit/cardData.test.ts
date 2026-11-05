import { SPYRO_LEAN, spyroGraph, spyroProvedGraph, type TlNode } from '@telelean/core';
import { describe, expect, it } from 'vitest';
import {
  cardChips,
  codeSegments,
  deleteDependents,
  dependsOn,
  displayName,
  footprintEntries,
  presuppositionLabel,
  presuppositionsOf,
  usedBy,
  usesInline,
  vocabIndex,
  type RelationContext,
} from '../../src/model/cardData';
import { makeNode, mentionGraph, statusGallery } from '../shared/graphs';

const graph = spyroGraph();
const proved = spyroProvedGraph();
const vocab = vocabIndex(graph.vocabulary);
const node = (id: string, g = graph) => g.nodes.find((n) => n.id === id) as TlNode;
const byId = (g = graph) => Object.fromEntries(g.nodes.map((n) => [n.id, n]));
const ctx = (g = graph): RelationContext => {
  const order = { ASSUMPTION: [] as string[], DERIVATION: [] as string[], GOAL: [] as string[] };
  for (const n of g.nodes) order[n.type].push(n.id);
  return { edges: g.edges, nodes: byId(g), order };
};

describe('uses line (request 2)', () => {
  it('prints the first two short names, then ", …" when there are more (from lean.uses, not hard-coded)', () => {
    expect(usesInline(node('cynder-not-good').lean.uses ?? [], 'Spyro', vocab)).toBe('GoodAddition, cynder, …');
    expect(usesInline(node('cynder-dark-past').lean.uses ?? [], 'Spyro', vocab)).toBe('HasDarkPast, cynder');
    expect(usesInline(['Spyro.IsPG'], 'Spyro', vocab)).toBe('IsPG');
  });

  it('keeps names from another subject fully qualified', () => {
    expect(displayName('Bayonetta.Witch', 'Spyro', vocab)).toBe('Bayonetta.Witch');
    expect(usesInline(['Bayonetta.Witch', 'Spyro.cynder', 'Spyro.IsPG'], 'Spyro', vocab)).toBe('Bayonetta.Witch, cynder, …');
  });
});

describe('presupposition chips (D-3b)', () => {
  it('reads the sort gloss: "assumes characters exist"', () => {
    expect(presuppositionLabel('Spyro.Character.exists', 'Spyro', vocab)).toBe('assumes characters exist');
    expect(presuppositionLabel('Spyro.Game.exists', 'Spyro', vocab)).toBe('assumes games exist');
  });

  it('falls back to "assumes there is a <shortName>" without a gloss', () => {
    const bare = vocabIndex(graph.vocabulary.map((item) => (item.name === 'Spyro.Character' ? { ...item, gloss: undefined } : item)));
    expect(presuppositionLabel('Spyro.Character.exists', 'Spyro', bare)).toBe('assumes there is a Character');
    expect(presuppositionLabel('Other.Thing.exists', 'Spyro', vocabIndex([]))).toBe('assumes there is a Other.Thing');
  });

  it('collects the presuppositions of a selection, first occurrence order', () => {
    expect(presuppositionsOf(['new-spyro-pg', 'cynder-not-good', 'pg-no-dark-past'], byId())).toEqual(['Spyro.Game.exists', 'Spyro.Character.exists']);
  });
});

describe('code segments (request 4)', () => {
  it('cuts the identifiers Lean resolved out of the code at their UTF-16 ranges', () => {
    const lines = codeSegments(SPYRO_LEAN.cynderDarkPast, node('cynder-dark-past').lean.refs);
    expect(lines).toHaveLength(3);
    const refs = lines.flatMap((line) => line.filter((s) => s.ref).map((s) => [s.text, s.ref?.name, s.ref?.nodeId ?? null]));
    expect(refs).toEqual([
      ['HasDarkPast', 'Spyro.HasDarkPast', null],
      ['cynder', 'Spyro.cynder', null],
      ['cynder_dark_past', 'Spyro.cynder_dark_past', 'cynder-dark-past'],
    ]);
    expect(lines.map((line) => line.map((s) => s.text).join(''))).toEqual(SPYRO_LEAN.cynderDarkPast.split('\n'));
  });

  it('maps every ref of the proved goal (statement and proof) to its identifier', () => {
    const goal = node('cynder-not-good', proved);
    const lines = codeSegments(goal.lean.code ?? '', goal.lean.refs);
    const texts = lines.flatMap((line) => line.filter((s) => s.ref).map((s) => s.text));
    expect(texts).toEqual(['GoodAddition', 'cynder', 'newSpyro', 'cynder_not_good', 'pg_no_dark_past.holds', 'newSpyro', 'cynder', 'new_spyro_pg.holds', 'cynder_dark_past.holds']);
  });

  it('ignores refs that span lines, overlap or fall outside their line, and handles CRLF', () => {
    const ref = (line: number, from: number, to: number, endLine = line) => ({ name: 'X', range: { start: { line, character: from }, end: { line: endLine, character: to } } });
    const lines = codeSegments('abc def\r\nghi', [ref(0, 0, 3), ref(0, 1, 5), ref(0, 4, 7, 1), ref(1, 9, 12), ref(1, 0, 3)]);
    expect(lines.map((l) => l.map((s) => [s.text, Boolean(s.ref)]))).toEqual([
      [
        ['abc', true],
        [' def', false],
      ],
      [['ghi', true]],
    ]);
    expect(codeSegments('', undefined)).toEqual([[{ text: '' }]]);
  });
});

describe('card chips (AT6.3 data)', () => {
  const gallery = statusGallery();
  const nodes = byId(gallery);
  const chips = (id: string) => cardChips(nodes[id] as TlNode, nodes);
  const labels = (id: string) => chips(id).map((c) => c.label);

  it('formalised nodes get the Lean chip; a code-less assumption gets "no Lean yet" and "no source yet" (stance rule)', () => {
    expect(labels('cynder-dark-past')).toEqual(['λ Lean', 'assumed']);
    expect(labels('pg-no-dark-past')).toEqual(['λ Lean', 'assumed', 'no source yet']); // formalised in the proved graph, still no reason
    expect(cardChips(node('pg-no-dark-past'), byId())).toMatchObject([{ key: 'lean', label: 'no Lean yet' }, { key: 'no-rationale', label: 'no source yet', action: 'edit-rationale' }]);
  });

  it('one chip per ProofStatus kind and M1 flag', () => {
    expect(chips('cynder-not-good')).toEqual([
      expect.objectContaining({ key: 'lean' }),
      expect.objectContaining({ key: 'proved-goal', label: '✓ proved: make Derivation?', action: 'make-derivation' }),
    ]);
    expect(labels('d-pending')).toContain('promotion pending');
    expect(labels('d-conditional')).toContain('conditional on Cynder is not PG material');
    expect(labels('g-sorry')).toEqual(['λ Lean', 'uses sorry']);
    expect(labels('a-missing')).toEqual(['λ Lean', 'missing .holds']);
    expect(labels('g-unchecked')).toEqual(['λ Lean', 'unproved', 'not checked by Lean']);
    expect(chips('a-stale')).toEqual([
      expect.objectContaining({ key: 'lean' }),
      expect.objectContaining({ key: 'proof', label: 'assumed', dim: true }),
      expect.objectContaining({ key: 'stale', label: 'changed since last check' }),
    ]);
    // "checking…" only while Lean is checking (the badge says "Lean: checking…" then).
    expect(cardChips(nodes['a-stale'] as TlNode, nodes, true).find((c) => c.key === 'stale')).toMatchObject({ label: 'checking…' });
    expect(labels('a-premised')).toContain('you think this follows from those: prove it?');
  });

  it('never shows a check mark for a node Lean has not checked', () => {
    const odd = makeNode('x', 'GOAL', 'odd', { proof: { kind: 'proved', footprint: [] }, flags: ['not-checked'] });
    expect(cardChips(odd, { x: odd }).map((c) => c.label).join(' ')).not.toContain('✓');
  });

  it('ill-formed nodes say so', () => {
    const bad = makeNode('x', 'ASSUMPTION', 'bad', { formal: 'ill-formed' });
    expect(cardChips(bad, { x: bad })[0]).toMatchObject({ key: 'lean', label: 'Lean problem', tone: 'error' });
  });
});

describe('relations (Depends on / Used by, AT6.21 data)', () => {
  it('the proved goal depends on the three assumptions (declared and used by the proof)', () => {
    expect(dependsOn('cynder-not-good', ctx(proved))).toEqual([
      { id: 'pg-no-dark-past', reasons: ['declared', 'proof'] },
      { id: 'cynder-dark-past', reasons: ['declared', 'proof'] },
      { id: 'new-spyro-pg', reasons: ['declared', 'proof'] },
    ]);
    expect(usedBy('cynder-dark-past', ctx(proved))).toEqual([{ id: 'cynder-not-good', reasons: ['declared', 'proof'] }]);
    expect(usedBy('cynder-not-good', ctx(proved))).toEqual([]);
    expect(dependsOn('cynder-dark-past', ctx(proved))).toEqual([]);
  });

  it('statement mentions come from lean-ref edges', () => {
    const g = mentionGraph();
    expect(dependsOn('cynder-not-good', ctx(g)).find((r) => r.id === 'cynder-dark-past')?.reasons).toEqual(['declared', 'statement']);
    expect(usedBy('cynder-dark-past', ctx(g))).toEqual([{ id: 'cynder-not-good', reasons: ['declared', 'statement'] }]);
  });

  it('the delete dialog lists declared premises, proofs and statement mentions', () => {
    expect(deleteDependents('cynder-dark-past', ctx(proved))).toEqual({ declaredBy: ['cynder-not-good'], proofs: ['cynder-not-good'], mentions: [] });
    expect(deleteDependents('cynder-dark-past', ctx(mentionGraph()))).toEqual({ declaredBy: ['cynder-not-good'], proofs: [], mentions: ['cynder-not-good'] });
    expect(deleteDependents('cynder-not-good', ctx(proved))).toEqual({ declaredBy: [], proofs: [], mentions: [] });
  });
});

describe('footprint entries', () => {
  it('maps node ids, presuppositions and unexpected axioms', () => {
    const goal = node('cynder-not-good', proved);
    const footprint = goal.status.proof.kind === 'proved' ? goal.status.proof.footprint : [];
    expect(footprintEntries([...footprint, 'axiom:Spyro.sneaky', 'elsewhere-node'], byId(proved), 'Spyro', vocab)).toEqual([
      { kind: 'node', id: 'cynder-dark-past' },
      { kind: 'node', id: 'new-spyro-pg' },
      { kind: 'node', id: 'pg-no-dark-past' },
      { kind: 'presupposition', name: 'Spyro.Character.exists', label: 'assumes characters exist' },
      { kind: 'presupposition', name: 'Spyro.Game.exists', label: 'assumes games exist' },
      { kind: 'axiom', name: 'Spyro.sneaky' },
      { kind: 'other', name: 'elsewhere-node' },
    ]);
  });
});
