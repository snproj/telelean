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
    const impact = kindChangeImpact(graph, 'pg-no-dark-past', 'PROPOSITION');
    expect(impact).toMatchObject({ leanChange: 'none', needsConfirmation: false, summary: 'Becomes a proposition: no Lean change' });
  });

  it('A->P keeps the axiom: pending proof until proved (AR-6, for the arrow gestures)', () => {
    expect(kindChangeImpact(graph, 'cynder-dark-past', 'PROPOSITION')).toMatchObject({
      leanChange: 'pending',
      summary: 'Becomes a proposition: pending proof until proved',
      detail: '`axiom cynder_dark_past.holds` stays, marked pending proof, until a run proves it (`theorem cynder_dark_past.holds : … := …`).',
      needsConfirmation: false,
    });
  });

  it('P->A adds the axiom, says that its arrows go (AR-7) and asks why', () => {
    expect(kindChangeImpact(graph, 'cynder-not-good', 'AXIOM')).toMatchObject({
      leanChange: 'add-axiom',
      summary: 'Move to axioms: adds axiom cynder_not_good.holds',
      detail: 'Adds `axiom cynder_not_good.holds : cynder_not_good` after the statement, so proofs may use it. Its 3 incoming arrows are removed.',
      asksRationale: true,
    });
  });

  it('a proved proposition: ->A archives the proof', () => {
    expect(kindChangeImpact(proved, 'cynder-not-good', 'AXIOM')).toMatchObject({
      leanChange: 'theorem-to-axiom',
      summary: 'Move to axioms: its proof becomes an axiom',
      detail: '`theorem cynder_not_good.holds` becomes `axiom cynder_not_good.holds`; the proof is kept in the attic. Its 3 incoming arrows are removed.',
    });
  });

  it('A->P with proof dependents names what loses its green glow (the gesture states it; no dialog)', () => {
    expect(proofDependents(proved, 'cynder-dark-past')).toEqual(['cynder-not-good']);
    const impact = kindChangeImpact(proved, 'cynder-dark-past', 'PROPOSITION');
    expect(impact).toMatchObject({ leanChange: 'pending', needsConfirmation: false, dependents: ['cynder-not-good'], rewriteAvailable: true });
    expect(impact.detail).toContain('1 card that rests on it will lose its green glow until it is proved.');
    expect(kindChangeImpact({ ...proved, semantic: { state: 'stale' } }, 'cynder-dark-past', 'PROPOSITION').rewriteAvailable).toBe(false);
    // Only established cards glow (BD-6): a dependent that is not established loses nothing, and the text says nothing.
    const unestablished = { ...proved, nodes: proved.nodes.map((n) => ({ ...n, status: { ...n.status, flags: n.status.flags.filter((f) => f !== 'established') } })) };
    const quiet = kindChangeImpact(unestablished, 'cynder-dark-past', 'PROPOSITION');
    expect(quiet.dependents).toEqual(['cynder-not-good']);
    expect(quiet.detail).not.toContain('green glow');
  });

  it('refuses unknown cards and same-column moves', () => {
    expect(() => kindChangeImpact(graph, 'nope', 'PROPOSITION')).toThrow(ActionError);
    expect(() => kindChangeImpact(graph, 'cynder-not-good', 'PROPOSITION')).toThrow(/re-orders/);
  });
});

describe('layout.json helpers', () => {
  const nodes = [
    { id: 'a1', type: 'AXIOM' as const },
    { id: 'a2', type: 'AXIOM' as const },
    { id: 'g1', type: 'PROPOSITION' as const },
    { id: 'a3', type: 'AXIOM' as const },
  ];

  it('orders by layout first, then file order; ignores unknown and misplaced ids', () => {
    const layout = parseLayout(JSON.stringify({ columns: { AXIOM: ['a3', 'gone', 'a1', 'a3'], PROPOSITION: ['a2'] } }));
    expect(layout.columns.AXIOM).toEqual(['a3', 'gone', 'a1']);
    expect(orderByLayout(nodes, layout)).toEqual({ AXIOM: ['a3', 'a1', 'a2'], PROPOSITION: ['g1'] });
  });

  it('moves, removes and appends; serialises stably; tolerates junk', () => {
    const current = orderByLayout(nodes, emptyLayout());
    const moved = moveInLayout(emptyLayout(), current, 'a3', 'AXIOM', 'a1');
    expect(moved.columns.AXIOM).toEqual(['a3', 'a1', 'a2']);
    expect(withoutIds(moved, ['a1']).columns.AXIOM).toEqual(['a3', 'a2']);
    expect(appendToLayout(moved, 'd1', 'PROPOSITION').columns.PROPOSITION).toEqual(['g1', 'd1']);
    expect(parseLayout(serializeLayout(moved))).toEqual(moved);
    expect(serializeLayout(moved).endsWith('\n')).toBe(true);
    expect(parseLayout('{not json')).toEqual(emptyLayout());
    expect(parseLayout(null)).toEqual(emptyLayout());
  });

  it('reads a layout written before spec v4: ASSUMPTION -> AXIOM, DERIVATION then GOAL -> PROPOSITION', () => {
    const old = JSON.stringify({ format: 'telelean-layout', version: 1, columns: { GOAL: ['g2', 'g1'], ASSUMPTION: ['a2', 'a1'], DERIVATION: ['d1', 'g2'] }, collapsed: { vocabulary: true } });
    const layout = parseLayout(old);
    expect(layout).toEqual({ format: 'telelean-layout', version: 1, columns: { AXIOM: ['a2', 'a1'], PROPOSITION: ['d1', 'g2', 'g1'] }, collapsed: { vocabulary: true } });
    // Written back in the v4 shape; a v4 key comes before the old ones it absorbs.
    expect(serializeLayout(layout)).toBe(
      '{\n  "format": "telelean-layout",\n  "version": 1,\n  "columns": {\n    "AXIOM": [\n      "a2",\n      "a1"\n    ],\n    "PROPOSITION": [\n      "d1",\n      "g2",\n      "g1"\n    ]\n  },\n  "collapsed": {\n    "vocabulary": true\n  }\n}\n',
    );
    expect(parseLayout(JSON.stringify({ columns: { ASSUMPTION: ['a1'], AXIOM: ['a2'], PROPOSITION: ['p1'], GOAL: ['g1'], DERIVATION: 'junk' } })).columns).toEqual({ AXIOM: ['a2', 'a1'], PROPOSITION: ['p1', 'g1'] });
    expect(orderByLayout(nodes, layout)).toEqual({ AXIOM: ['a2', 'a1', 'a3'], PROPOSITION: ['g1'] });
  });

  it('keeps canvas positions (numbers only; malformed entries dropped) and writes them sorted by id', () => {
    // `__proto__` written as a key of the file (an object literal would set the prototype instead).
    const json =
      '{"columns":{"AXIOM":[],"PROPOSITION":["p1","p2"]},"positions":{"p2":{"x":10.5,"y":-3},"p1":{"x":0,"y":0,"extra":true},"bad":{"x":"1","y":2},"half":{"x":1},"list":[1,2],"__proto__":{"x":1,"y":1}}}';
    const layout = parseLayout(json);
    expect(layout.positions).toEqual({ p1: { x: 0, y: 0 }, p2: { x: 10.5, y: -3 } });
    expect(Object.getPrototypeOf(layout.positions)).toBe(Object.prototype);
    const text = serializeLayout(layout);
    expect(text.indexOf('"p1"', text.indexOf('"positions"'))).toBeLessThan(text.indexOf('"p2"', text.indexOf('"positions"')));
    expect(parseLayout(text)).toEqual(layout);
    expect(serializeLayout(parseLayout(text))).toBe(text);
    // An infinite number (1e400 in the file) is not a position; no position at all means no `positions` key.
    expect(parseLayout('{"columns":{},"positions":{"p":{"x":1e400,"y":0}}}').positions).toBeUndefined();
    expect(serializeLayout(emptyLayout())).not.toContain('positions');
    // A deleted card's position goes with it; a move between columns keeps it.
    expect(withoutIds(layout, ['p2']).positions).toEqual({ p1: { x: 0, y: 0 } });
    expect(withoutIds(layout, ['p1', 'p2']).positions).toBeUndefined();
    expect(appendToLayout(layout, 'p1', 'AXIOM').positions).toEqual(layout.positions);
    expect(moveInLayout(layout, layout.columns, 'p2', 'PROPOSITION', 'p1').positions).toEqual(layout.positions);
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
    const graph = buildGraph({ subject: 'S', version: 1, nodes: [createUserNode({ id: 'x', type: 'PROPOSITION', naturalName: 'X', subject: 'S' })] });
    expect(graph.vocabulary).toEqual([]);
    expect(graph.diagnostics).toEqual([]);
    expect(graph.semantic).toEqual({ state: 'unavailable' });
  });
});
