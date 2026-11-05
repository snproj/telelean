/**
 * Tests of the M1 contract code the architect implemented (docs/m1-plan.md section 5): the Spyro sample's card data,
 * D-11 drop-zone impacts, layout.json helpers, path conventions and the M1 graph fields.
 */
import { describe, expect, it } from 'vitest';
import {
  ActionError,
  appendToLayout,
  atticPath,
  buildGraph,
  createUserNode,
  emptyLayout,
  inboxPath,
  inScope,
  kindChangeImpact,
  layoutPath,
  moduleOfPath,
  moveInLayout,
  orderByLayout,
  parseLayout,
  parseProjectConfig,
  pathOfModule,
  proofDependents,
  serializeLayout,
  spyroGraph,
  spyroProvedGraph,
  subjectOfPath,
  subjectScaffold,
  subjectSnapshotScope,
  withoutIds,
  type TlGraph,
  type TlNode,
} from '../src/index.js';

const byId = (graph: TlGraph, id: string): TlNode => {
  const node = graph.nodes.find((n) => n.id === id);
  if (!node) throw new Error(`missing node ${id}`);
  return node;
};

describe('Spyro sample: M1 card data', () => {
  for (const [label, graph] of [
    ['as written', spyroGraph()],
    ['after the normative run', spyroProvedGraph()],
  ] as const) {
    it(`${label}: every ref points at its identifier inside the card's code`, () => {
      for (const node of graph.nodes) {
        const lines = (node.lean.code ?? '').split('\n');
        for (const ref of node.lean.refs ?? []) {
          expect(ref.range.start.line, `${node.id} ${ref.name}`).toBe(ref.range.end.line);
          const text = lines[ref.range.start.line]?.slice(ref.range.start.character, ref.range.end.character) ?? '';
          expect(text.length, `${node.id} ${ref.name}`).toBeGreaterThan(0);
          expect(ref.name.endsWith(text), `${node.id}: "${text}" is not a suffix of ${ref.name}`).toBe(true);
        }
      }
    });

    it(`${label}: uses, presuppositions and node refs resolve`, () => {
      const vocab = new Set(graph.vocabulary.map((v) => v.name));
      const ids = new Set(graph.nodes.map((n) => n.id));
      for (const node of graph.nodes) {
        for (const name of node.lean.uses ?? []) expect(vocab.has(name), `${node.id} uses ${name}`).toBe(true);
        for (const name of node.lean.presupposes ?? []) {
          expect(graph.vocabulary.find((v) => v.name === name)?.kind, `${node.id} presupposes ${name}`).toBe('presupposition');
        }
        for (const ref of node.lean.refs ?? []) {
          if (ref.nodeId) expect(ids.has(ref.nodeId)).toBe(true);
          else expect(vocab.has(ref.name), `${node.id} ref ${ref.name}`).toBe(true);
        }
      }
      for (const item of graph.vocabulary) {
        for (const id of item.usedBy) expect(ids.has(id), `${item.name} usedBy ${id}`).toBe(true);
        expect(item.name.endsWith(item.shortName)).toBe(true);
      }
    });
  }

  it('the goal uses GoodAddition, cynder, newSpyro and presupposes characters and games exist', () => {
    const goal = byId(spyroGraph(), 'cynder-not-good');
    expect(goal.lean.uses).toEqual(['Spyro.GoodAddition', 'Spyro.cynder', 'Spyro.newSpyro']);
    expect(goal.lean.presupposes).toEqual(['Spyro.Character.exists', 'Spyro.Game.exists']);
    expect(spyroGraph().semantic.state).toBe('fresh');
    expect(spyroGraph().vocabulary.map((v) => v.kind)).toEqual([
      'sort',
      'sort',
      'predicate',
      'predicate',
      'predicate',
      'constant',
      'constant',
      'presupposition',
      'presupposition',
    ]);
  });
});

describe('kindChangeImpact (D-11 drop zones)', () => {
  const graph = spyroGraph();
  const proved = spyroProvedGraph();

  it('code-less cards change only their type', () => {
    const impact = kindChangeImpact(graph, 'pg-no-dark-past', 'GOAL');
    expect(impact).toMatchObject({ leanChange: 'none', needsConfirmation: false, summary: 'Make Goal: no Lean change' });
  });

  it('A->D keeps the axiom: promotion pending until proved', () => {
    expect(kindChangeImpact(graph, 'cynder-dark-past', 'DERIVATION')).toMatchObject({
      leanChange: 'pending-promotion',
      summary: 'Make Derivation: promotion pending until proved',
      needsConfirmation: false,
    });
  });

  it('G->A adds the axiom and asks why; G->D needs a proof', () => {
    expect(kindChangeImpact(graph, 'cynder-not-good', 'ASSUMPTION')).toMatchObject({
      leanChange: 'add-axiom',
      summary: 'Make Assumption: adds axiom cynder_not_good.holds',
      asksRationale: true,
    });
    expect(kindChangeImpact(graph, 'cynder-not-good', 'DERIVATION')).toMatchObject({ leanChange: 'none', summary: 'Make Derivation: counts as derived once proved' });
  });

  it('a proved goal: ->A archives the proof, ->D is already proved', () => {
    expect(kindChangeImpact(proved, 'cynder-not-good', 'ASSUMPTION')).toMatchObject({ leanChange: 'theorem-to-axiom' });
    expect(kindChangeImpact(proved, 'cynder-not-good', 'DERIVATION')).toMatchObject({ summary: 'Make Derivation: already proved' });
  });

  it('A->G with proof dependents needs a confirmation that names them', () => {
    expect(proofDependents(proved, 'cynder-dark-past')).toEqual(['cynder-not-good']);
    const impact = kindChangeImpact(proved, 'cynder-dark-past', 'GOAL');
    expect(impact).toMatchObject({
      leanChange: 'remove-holds',
      needsConfirmation: true,
      dependents: ['cynder-not-good'],
      rewriteAvailable: true,
      summary: 'Make Goal: 1 dependent needs a hypothesis rewrite',
    });
    // The hypothesis the rewrite really writes (`h_<statement>`), not a generic `h`.
    expect(impact.detail).toContain('`(h_cynder_dark_past : cynder_dark_past)`');
    const stale = kindChangeImpact({ ...proved, semantic: { state: 'stale' } }, 'cynder-dark-past', 'GOAL');
    expect(stale.rewriteAvailable).toBe(false);
    expect(stale.detail).toMatch(/Refresh Lean first/);
  });

  it('A->G without dependents just removes .holds', () => {
    const impact = kindChangeImpact(graph, 'new-spyro-pg', 'GOAL');
    expect(impact).toMatchObject({
      leanChange: 'remove-holds',
      needsConfirmation: false,
      summary: 'Make Goal: removes new_spyro_pg.holds',
    });
    // Only what the graph shows: a lemma without a card may still use it (the host asks about those).
    expect(impact.detail).toBe('A goal is not taken as given, so `new_spyro_pg.holds` is removed. No card on this board uses it.');
  });

  it('refuses unknown cards and same-column moves', () => {
    expect(() => kindChangeImpact(graph, 'nope', 'GOAL')).toThrow(ActionError);
    expect(() => kindChangeImpact(graph, 'cynder-not-good', 'GOAL')).toThrow(/re-orders/);
  });
});

describe('layout.json helpers', () => {
  const nodes = [
    { id: 'a1', type: 'ASSUMPTION' as const },
    { id: 'a2', type: 'ASSUMPTION' as const },
    { id: 'g1', type: 'GOAL' as const },
    { id: 'a3', type: 'ASSUMPTION' as const },
  ];

  it('orders by layout first, then file order; ignores unknown and misplaced ids', () => {
    const layout = parseLayout(JSON.stringify({ columns: { ASSUMPTION: ['a3', 'gone', 'a1', 'a3'], GOAL: ['a2'] } }));
    expect(layout.columns.ASSUMPTION).toEqual(['a3', 'gone', 'a1']);
    expect(orderByLayout(nodes, layout)).toEqual({ ASSUMPTION: ['a3', 'a1', 'a2'], DERIVATION: [], GOAL: ['g1'] });
  });

  it('moves, removes and appends; serialises stably; tolerates junk', () => {
    const current = orderByLayout(nodes, emptyLayout());
    const moved = moveInLayout(emptyLayout(), current, 'a3', 'ASSUMPTION', 'a1');
    expect(moved.columns.ASSUMPTION).toEqual(['a3', 'a1', 'a2']);
    expect(withoutIds(moved, ['a1']).columns.ASSUMPTION).toEqual(['a3', 'a2']);
    expect(appendToLayout(moved, 'd1', 'DERIVATION').columns.DERIVATION).toEqual(['d1']);
    expect(parseLayout(serializeLayout(moved))).toEqual(moved);
    expect(serializeLayout(moved).endsWith('\n')).toBe(true);
    expect(parseLayout('{not json')).toEqual(emptyLayout());
    expect(parseLayout(null)).toEqual(emptyLayout());
  });
});

describe('path conventions', () => {
  it('maps files to modules and subjects', () => {
    expect(moduleOfPath('Model/Spyro/Main.lean')).toBe('Model.Spyro.Main');
    expect(moduleOfPath('Model/../x.lean')).toBeUndefined();
    expect(pathOfModule('Model.Spyro.Inbox')).toBe('Model/Spyro/Inbox.lean');
    expect(subjectOfPath('Model/Spyro/Main.lean')).toBe('Spyro');
    expect(subjectOfPath('Model/Spyro.lean')).toBe('Spyro');
    expect(subjectOfPath('Model.lean')).toBeUndefined();
    expect(subjectOfPath('Other/Spyro/Main.lean')).toBeUndefined();
    expect(inboxPath('Spyro')).toBe('Model/Spyro/Inbox.lean');
    expect(layoutPath('Spyro')).toBe('.telelean/subjects/Spyro/layout.json');
    expect(atticPath('Spyro', 'cynder-not-good')).toBe('.telelean/subjects/Spyro/attic/cynder-not-good.lean');
  });

  it('scopes a subject snapshot to its own files', () => {
    const scope = subjectSnapshotScope('Spyro');
    expect(inScope('Model/Spyro/Main.lean', scope)).toBe(true);
    expect(inScope('Model/Spyro.lean', scope)).toBe(true);
    expect(inScope('.telelean/subjects/Spyro/layout.json', scope)).toBe(true);
    expect(inScope('Model/SpyroTwo/Main.lean', scope)).toBe(false);
    expect(inScope('Model.lean', scope)).toBe(false);
  });

  it('reads config.json leniently', () => {
    expect(parseProjectConfig('{"library":"Beliefs"}').library).toBe('Beliefs');
    expect(parseProjectConfig('{"library":"../x"}').library).toBe('Model');
    expect(parseProjectConfig('nope').library).toBe('Model');
  });
});

describe('subjectScaffold (exact texts of docs/m1-plan.md section 7.1; verified to build on Lean 4.35)', () => {
  it('writes the subject root and the three namespaced modules', () => {
    expect(subjectScaffold('Spyro', 'Model')).toEqual([
      { path: 'Model/Spyro.lean', text: 'import Model.Spyro.Vocabulary\nimport Model.Spyro.Inbox\nimport Model.Spyro.Main\n' },
      {
        path: 'Model/Spyro/Vocabulary.lean',
        text: '-- Vocabulary of Spyro: types, predicates and constants (the board lists them in its Vocabulary group).\nnamespace Spyro\n\nend Spyro\n',
      },
      {
        path: 'Model/Spyro/Inbox.lean',
        text: 'import Model.Spyro.Vocabulary\n\n-- New cards typed on the telelean board are added here.\nnamespace Spyro\n\nend Spyro\n',
      },
      {
        path: 'Model/Spyro/Main.lean',
        text: 'import Model.Spyro.Vocabulary\nimport Model.Spyro.Inbox\n\n-- Formalised cards: a statement `abbrev n : Prop := …` and its `n.holds`.\nnamespace Spyro\n\nend Spyro\n',
      },
    ]);
  });

  it('refuses names that are not subject or library names', () => {
    expect(() => subjectScaffold('spyro', 'Model')).toThrow(ActionError);
    expect(() => subjectScaffold('Spyro', '../x')).toThrow(ActionError);
  });
});

describe('graph helpers', () => {
  it('buildGraph fills the M1 graph fields', () => {
    const graph = buildGraph({ subject: 'S', version: 1, nodes: [createUserNode({ id: 'x', type: 'GOAL', naturalName: 'X', subject: 'S' })] });
    expect(graph.vocabulary).toEqual([]);
    expect(graph.diagnostics).toEqual([]);
    expect(graph.semantic).toEqual({ state: 'unavailable' });
  });
});
