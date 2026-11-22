import { SPYRO_LEAN, spyroGraph, spyroProvedGraph, type TlNode } from '@telelean/core';
import { describe, expect, it } from 'vitest';
import {
  cardChips,
  cardGlow,
  codeSegments,
  declaredBeforeV4,
  deleteDependents,
  dependsOn,
  displayName,
  footprintEntries,
  presuppositionLabel,
  presuppositionsOf,
  quotedNames,
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
  const order = { AXIOM: [] as string[], PROPOSITION: [] as string[] };
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

  it('formalised nodes get the Lean chip; a code-less axiom gets "no Lean yet" and "no source yet" (stance rule)', () => {
    expect(labels('cynder-dark-past')).toEqual(['λ Lean', 'assumed']);
    expect(labels('pg-no-dark-past')).toEqual(['λ Lean', 'assumed', 'no source yet']); // formalised in the proved graph, still no reason
    expect(cardChips(node('pg-no-dark-past'), byId())).toMatchObject([{ key: 'lean', label: 'no Lean yet' }, { key: 'no-rationale', label: 'no source yet', action: 'edit-rationale' }]);
  });

  it('one chip per ProofStatus kind and M1 flag', () => {
    // Spec v4.1 BD-6 (slice 1d): the proved goal of the sample is established: "✓ established" (no "make Derivation?"
    // chip, no TL105), with the green glow (cardGlow).
    expect(chips('cynder-not-good')).toEqual([expect.objectContaining({ key: 'lean' }), expect.objectContaining({ key: 'established', label: '✓ established', tone: 'proved' })]);
    expect(chips('cynder-not-good').some((c) => c.action !== undefined)).toBe(false);
    expect(chips('d-pending')).toContainEqual(expect.objectContaining({ key: 'pending', label: 'pending proof' }));
    expect(labels('d-conditional')).toContain('proved, given: Cynder is not PG material');
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
    // Spec v4 A19 (slice 1b): an axiom's premises: from before v4 is not drawn; the chip offers the two ways out.
    expect(chips('a-premised')).toContainEqual(expect.objectContaining({ key: 'declared-before-v4', label: 'declared before v4: make it a proposition, or drop these arrows', tone: 'info' }));
    expect(labels('cynder-dark-past')).not.toContain('declared before v4: make it a proposition, or drop these arrows');
    // Slice 2i (audit G11): its tooltip names the card the arrow comes from, by its sentence.
    expect(chips('a-premised').find((c) => c.key === 'declared-before-v4')?.title).toBe(
      'Its premises: line (1 arrow into it, from “Cynder is a character who has a dark past”) was written before v4, when axioms could have arrows; the board does not draw them. Its details offer "Make it a proposition (pending)" and "Drop these arrows".',
    );
  });

  describe('slice 2i (A19, audit G11): an old axiom\'s declared premises are named', () => {
    const a = makeNode('pa', 'AXIOM', 'Ratings are public', { proof: { kind: 'assumed' } });
    const b = makeNode('pb', 'PROPOSITION', 'Critics read ratings', {});
    const old = (premises: string[]) => makeNode('old', 'AXIOM', 'Ratings follow content', { proof: { kind: 'assumed' } }, { premises });
    const board = (o: TlNode) => ({ pa: a, pb: b, old: o });
    const chipOf = (o: TlNode) => cardChips(o, board(o)).find((c) => c.key === 'declared-before-v4');

    it('none: an axiom without premises, or a proposition with arrows, has no such chip and nothing to name', () => {
      expect(declaredBeforeV4(old([]), board(old([])))).toEqual([]);
      expect(chipOf(old([]))).toBeUndefined();
      const proposition = makeNode('pp', 'PROPOSITION', 'Follows from both', {}, { premises: ['pa', 'pb'] });
      expect(declaredBeforeV4(proposition, { ...board(old([])), pp: proposition })).toEqual([]);
      expect(cardChips(proposition, { ...board(old([])), pp: proposition }).some((c) => c.key === 'declared-before-v4')).toBe(false);
    });

    it('one and several: each premise\'s card by its sentence, in order, in the chip\'s tooltip', () => {
      expect(declaredBeforeV4(old(['pa']), board(old(['pa'])))).toEqual(['Ratings are public']);
      expect(chipOf(old(['pa']))?.title).toContain('(1 arrow into it, from “Ratings are public”)');
      const both = old(['pb', 'pa']);
      expect(declaredBeforeV4(both, board(both))).toEqual(['Critics read ratings', 'Ratings are public']);
      expect(chipOf(both)?.title).toContain('(2 arrows into it, from “Critics read ratings”, “Ratings are public”)');
      expect(chipOf(both)?.label).toBe('declared before v4: make it a proposition, or drop these arrows');
    });

    it('a premise listed twice is named once and counted once; a card not on this board by its id; the axiom itself by its sentence', () => {
      const twice = old(['pa', 'pa', 'pb']);
      expect(declaredBeforeV4(twice, board(twice))).toEqual(['Ratings are public', 'Critics read ratings']);
      expect(chipOf(twice)?.title).toContain('(2 arrows into it, from “Ratings are public”, “Critics read ratings”)');
      const odd = old(['gone', 'old']);
      expect(declaredBeforeV4(odd, board(odd))).toEqual(['gone', 'Ratings follow content']);
    });

    it('quotedNames quotes and joins; nothing gives nothing', () => {
      expect(quotedNames([])).toBe('');
      expect(quotedNames(['A'])).toBe('“A”');
      expect(quotedNames(['A', 'B', 'C'])).toBe('“A”, “B”, “C”');
    });
  });

  it('spec v4 AR-5 (slice 1b): a card marked "follows from nothing" shows the mark as a chip', () => {
    const marked = makeNode('fn', 'PROPOSITION', 'Follows from nothing', {}, { fromNothing: true });
    expect(cardChips(marked, { fn: marked })).toContainEqual(expect.objectContaining({ key: 'from-nothing', label: 'follows from nothing', tone: 'info' }));
    expect(chips('cynder-not-good').some((c) => c.key === 'from-nothing')).toBe(false);
  });

  it('spec v4: "rests on pending" for a proof resting on a pending proposition; "has a proof" (no button) on an axiom with a theorem', () => {
    const pending = makeNode('w', 'PROPOSITION', 'w', { proof: { kind: 'proved', footprint: ['d-pending'] }, flags: ['rests-on-pending'] });
    expect(cardChips(pending, { ...nodes, w: pending })).toContainEqual(
      expect.objectContaining({ key: 'rests-on-pending', label: 'proved, but rests on pending: Cynder is not PG material', tone: 'attention' }),
    );
    const provable = makeNode('ax', 'AXIOM', 'ax', { proof: { kind: 'proved', footprint: [] }, flags: ['provable-assumption'] });
    const chip = cardChips(provable, { ax: provable }).find((c) => c.key === 'provable-assumption');
    expect(chip).toMatchObject({ label: 'has a proof', tone: 'info' });
    expect(chip?.action).toBeUndefined();
    // Slice 1d (BD-6): an axiom never glows green and has no proof chip of its own: "has a proof" says it.
    expect(cardChips(provable, { ax: provable }).map((c) => c.key)).toEqual(['lean', 'provable-assumption']);
    // An axiom's `.holds` axiom is simply assumed (TL116's "make it an Assumption?" is gone with the GOAL kind).
    expect(chips('cynder-dark-past').find((c) => c.key === 'proof')).toMatchObject({ label: 'assumed', title: 'Taken as an axiom', tone: 'plain' });
  });

  it('never shows a check mark for a node Lean has not checked', () => {
    const odd = makeNode('x', 'PROPOSITION', 'odd', { proof: { kind: 'proved', footprint: [] }, flags: ['not-checked'] });
    expect(cardChips(odd, { x: odd }).map((c) => c.label).join(' ')).not.toContain('✓');
  });

  it('ill-formed nodes say so', () => {
    const bad = makeNode('x', 'AXIOM', 'bad', { formal: 'ill-formed' });
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

describe('spec v4.1 BD-6 (slice 1d): glows and the chips that say why', () => {
  const goal = (status: Partial<TlNode['status']>, extra: Partial<TlNode> = {}) => makeNode('g', 'PROPOSITION', 'The goal', status, extra);
  const pending = makeNode('p', 'PROPOSITION', 'A pending claim', { proof: { kind: 'pending' } });
  const axiom = makeNode('a', 'AXIOM', 'An axiom', { proof: { kind: 'assumed' } });
  const nodes = { p: pending, a: axiom };
  const keyed = (node: TlNode) => cardChips(node, { ...nodes, [node.id]: node }).filter((c) => c.key !== 'lean');

  it('established: "✓ established" and the green glow, which replaces the blue one', () => {
    const node = goal({ proof: { kind: 'proved', footprint: ['a'] }, flags: ['established'] });
    expect(keyed(node)).toEqual([expect.objectContaining({ key: 'established', label: '✓ established', tone: 'proved' })]);
    expect(cardGlow(node)).toEqual({ glow: 'established', dim: false });
    // Never colour alone: the chip carries the ✓ as well.
    expect(keyed(node)[0]?.label.startsWith('✓')).toBe(true);
  });

  it('proved but resting on pending: the blue glow and "proved, but rests on pending: ‹card›"', () => {
    const node = goal({ proof: { kind: 'proved', footprint: ['a', 'p'] }, flags: ['rests-on-pending'] });
    expect(keyed(node)).toEqual([expect.objectContaining({ key: 'rests-on-pending', label: 'proved, but rests on pending: A pending claim' })]);
    expect(cardGlow(node)).toEqual({ glow: 'formalized', dim: false });
  });

  it('a conditional proof: "proved, given: ‹card›"', () => {
    const node = goal({ proof: { kind: 'conditional', on: ['p'], footprint: ['a'] } });
    expect(keyed(node).map((c) => c.label)).toEqual(['proved, given: A pending claim']);
    expect(cardGlow(node).glow).toBe('formalized');
  });

  it('a hidden assumption (TL103): "proved, but uses a hidden assumption"', () => {
    const node = goal({ proof: { kind: 'proved', footprint: ['a', 'axiom:Spyro.hidden'] } });
    expect(keyed(node).map((c) => [c.key, c.label])).toEqual([['hidden-assumption', 'proved, but uses a hidden assumption']]);
  });

  it('several reasons at once each get their chip; with none of them, plain "proved" (no ✓)', () => {
    const both = goal({ proof: { kind: 'conditional', on: ['p'], footprint: ['a', 'axiom:Spyro.hidden'] } });
    expect(keyed(both).map((c) => c.key)).toEqual(['conditional', 'hidden-assumption']);
    const plain = goal({ proof: { kind: 'proved', footprint: ['a'] } });
    expect(keyed(plain)).toEqual([expect.objectContaining({ key: 'proof', label: 'proved' })]);
  });

  it('pending: "pending proof"; an axiom never glows green, and one with a proof says "has a proof"', () => {
    expect(keyed(pending).map((c) => c.label)).toEqual(['pending proof']);
    const provable = makeNode('ax', 'AXIOM', 'Provable', { proof: { kind: 'proved', footprint: [] }, flags: ['provable-assumption', 'established'] });
    expect(cardGlow(provable).glow).toBe('formalized');
    expect(keyed(provable).map((c) => c.label)).toEqual(['has a proof']);
  });

  it('proved from nothing: the chip says so, unless the card is marked "follows from nothing" (its band says it then)', () => {
    const node = goal({ proof: { kind: 'proved', footprint: [] }, flags: ['established', 'self-evident'] });
    expect(keyed(node).map((c) => c.label)).toEqual(['✓ established', 'proved from nothing']);
    const marked = goal({ proof: { kind: 'proved', footprint: [] }, flags: ['established', 'self-evident'] }, { fromNothing: true });
    expect(keyed(marked).map((c) => c.key)).toEqual(['established', 'from-nothing']);
  });

  it('a use the arrows do not show (B.2 cross-check): its chip names the card', () => {
    const node = goal({ proof: { kind: 'proved', footprint: ['a'] }, flags: ['uses-unseen'], direct: { ids: [], from: 'source', unseen: ['a'] } });
    expect(keyed(node)).toContainEqual(expect.objectContaining({ key: 'uses-unseen', label: 'uses An axiom in a way the arrows do not show', tone: 'attention' }));
  });

  it('out-of-date facts: the last glow dimmed, never green, with "changed since last check"', () => {
    // Core never flags a stale card established; even if both arrive, the card does not glow green.
    const node = goal({ proof: { kind: 'proved', footprint: ['a'] }, flags: ['established', 'stale'] });
    expect(cardGlow(node)).toEqual({ glow: 'formalized', dim: true });
    const chips = keyed(node);
    expect(chips.find((c) => c.key === 'established')?.dim).toBe(true);
    expect(chips).toContainEqual(expect.objectContaining({ key: 'stale', label: 'changed since last check' }));
  });

  it('while the Proposed view hides the result: the blue glow, never the green one', () => {
    const node = goal({ proof: { kind: 'proved', footprint: ['a'] }, flags: ['established'] });
    expect(cardGlow(node, true)).toEqual({ glow: 'formalized', dim: false });
    expect(cardGlow(makeNode('x', 'PROPOSITION', 'x', { formal: 'informal' }))).toEqual({ glow: null, dim: false });
  });
});
