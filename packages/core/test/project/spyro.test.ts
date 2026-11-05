/**
 * AT2.1 (and the Spyro parts of AT2.4): buildProjectModel + subjectGraph on test-fixtures/spyro (and the
 * runner-lean `proved` overlay) with the hand-written facts reproduce the frozen samples spyroGraph() and
 * spyroProvedGraph(). Runs once with the fixture parser (test/project/helpers) and once with WP-markup's
 * parseLeanFile.
 */
import { describe, expect, it } from 'vitest';
import { parseLeanFile } from '../../src/markup/api.js';
import type { LeanFacts } from '../../src/facts.js';
import { subjectGraph } from '../../src/project/index.js';
import { proofDependents } from '../../src/kindChange.js';
import { SPYRO_SEMANTIC, spyroGraph, spyroProvedGraph, spyroVocabulary } from '../../src/samples/spyro.js';
import type { TlGraph } from '../../src/model.js';
import { parseFixture } from './helpers/parseFixture.js';
import { SPYRO_TEXTS, spyroDerivedFacts, spyroDerivedInput, spyroFacts, spyroModel, spyroProvedFacts, spyroProvedModel, type Parser } from './helpers/spyro.js';
import { buildProjectModel } from '../../src/project/index.js';
import { kindChangeImpact } from '../../src/kindChange.js';
import { planKindChange } from '../../src/edit/index.js';
import { ActionError } from '../../src/actions.js';

const sortedUsedBy = (graph: TlGraph) => graph.vocabulary.map((v) => ({ ...v, usedBy: [...v.usedBy].sort() }));
const edgeKeys = (graph: TlGraph, type: string) =>
  graph.edges
    .filter((e) => e.type === type)
    .map((e) => e.id)
    .sort();

const PARSERS: Array<[string, Parser]> = [
  ['fixture parser', parseFixture],
  ['WP-markup parseLeanFile', parseLeanFile],
];

for (const [label, parse] of PARSERS) {
  describe(`AT2.1 Spyro walkthrough (${label})`, () => {
    it('reproduces spyroGraph(): nodes with their card data and statuses, the vocabulary, the 3 declared edges', () => {
      const graph = subjectGraph(spyroModel(parse), 'Spyro', { version: 1, semantic: { ...SPYRO_SEMANTIC } });
      const sample = spyroGraph();
      expect(graph.nodes).toEqual(sample.nodes);
      expect(graph.vocabulary).toEqual(spyroVocabulary());
      expect(graph.vocabulary).toHaveLength(9);
      expect(graph.edges).toEqual(sample.edges);
      expect(graph.edges.every((e) => e.type === 'premise' && !e.mismatch)).toBe(true);
      expect(graph.semantic).toEqual(SPYRO_SEMANTIC);
      expect(graph.subject).toBe('Spyro');
    });

    it('hides the two Nonempty instances and lists only the expected diagnostics', () => {
      const model = spyroModel(parse);
      expect(model.vocabulary.map((v) => v.name)).not.toContain('Spyro.instNonemptyCharacter');
      expect(model.vocabulary.map((v) => v.name)).not.toContain('Spyro.instNonemptyGame');
      expect(model.diagnostics.map((d) => [d.code, d.nodeId])).toEqual([['TL011', 'pg-no-dark-past']]);
      expect(model.subjects).toEqual([{ name: 'Spyro', nodeCount: 4, files: ['Model/Spyro/Main.lean', 'Model/Spyro/Vocabulary.lean'] }]);
      expect([...model.freshFiles].sort()).toEqual(['Model.lean', 'Model/Spyro/Main.lean', 'Model/Spyro/Vocabulary.lean']);
      expect(model.ownerOfDecl.get('Spyro.cynder_dark_past.holds')).toBe('cynder-dark-past');
      expect(model.ownerOfDecl.get('Spyro.cynder_not_good')).toBe('cynder-not-good');
    });

    it('with the proved-overlay facts reproduces spyroProvedGraph(): statuses, footprint, verified edges, refs', () => {
      const graph = subjectGraph(spyroProvedModel(parse), 'Spyro', { version: 2, semantic: { ...SPYRO_SEMANTIC } });
      const sample = spyroProvedGraph();
      expect(graph.nodes).toEqual(sample.nodes);
      const goal = graph.nodes.find((n) => n.id === 'cynder-not-good');
      expect(goal?.status.proof).toEqual({
        kind: 'proved',
        footprint: ['cynder-dark-past', 'new-spyro-pg', 'pg-no-dark-past', 'presup:Spyro.Character.exists', 'presup:Spyro.Game.exists'],
      });
      expect(edgeKeys(graph, 'verified')).toEqual(edgeKeys(sample, 'verified'));
      expect(edgeKeys(graph, 'premise')).toEqual(edgeKeys(sample, 'premise'));
      expect(graph.edges.some((e) => e.mismatch)).toBe(false);
      expect(sortedUsedBy(graph)).toEqual(sortedUsedBy(sample));
      expect(proofDependents(graph, 'pg-no-dark-past')).toEqual(['cynder-not-good']);
      expect(graph.diagnostics.map((d) => [d.code, d.nodeId])).toEqual([
        ['TL011', 'pg-no-dark-past'],
        ['TL105', 'cynder-not-good'],
      ]);
    });

    it('AT2.11 on Spyro: a goal proved through a derivation gets the arrow from the derivation; D->G on it needs a confirmation', () => {
      const model = buildProjectModel(spyroDerivedInput(parse));
      const graph = subjectGraph(model, 'Spyro', { version: 3, semantic: SPYRO_SEMANTIC });
      const derivation = graph.nodes.find((n) => n.id === 'dark-and-pg');
      const goal = graph.nodes.find((n) => n.id === 'pg-again');
      const footprint = ['cynder-dark-past', 'new-spyro-pg', 'presup:Spyro.Character.exists', 'presup:Spyro.Game.exists'];
      expect(derivation?.status).toMatchObject({ formal: 'formalized', proof: { kind: 'proved', footprint }, flags: [] });
      expect(derivation?.lean.uses).toEqual(['Spyro.HasDarkPast', 'Spyro.cynder', 'Spyro.IsPG', 'Spyro.newSpyro']);
      expect(goal?.status).toMatchObject({ proof: { kind: 'proved', footprint }, flags: ['proved-goal'] });
      expect(goal?.lean.refs?.map((r) => [r.name, r.nodeId ?? null])).toEqual([
        ['Spyro.IsPG', null],
        ['Spyro.newSpyro', null],
        ['Spyro.pg_again', 'pg-again'],
        ['Spyro.dark_and_pg.holds', 'dark-and-pg'],
      ]);
      expect(graph.edges.filter((e) => e.target === 'pg-again').map((e) => e.id)).toEqual(['premise:dark-and-pg->pg-again', 'verified:dark-and-pg->pg-again']);
      expect(graph.edges.filter((e) => e.type === 'lean-ref').map((e) => e.id)).toEqual(['lean-ref:cynder-dark-past->dark-and-pg', 'lean-ref:new-spyro-pg->dark-and-pg']);
      expect(graph.edges.some((e) => e.mismatch)).toBe(false);
      expect(proofDependents(graph, 'dark-and-pg')).toEqual(['pg-again']);
      expect(kindChangeImpact(graph, 'dark-and-pg', 'GOAL')).toMatchObject({ needsConfirmation: true, dependents: ['pg-again'] });
      try {
        planKindChange(model, { id: 'dark-and-pg', to: 'GOAL' });
        throw new Error('expected a refusal');
      } catch (error) {
        expect(error).toBeInstanceOf(ActionError);
        expect(error).toMatchObject({ code: 'needs-confirmation', dependents: ['pg-again'] });
      }
    });

    it('AT2.4: every ref of the Spyro cards names the identifier it covers (a suffix of its name)', () => {
      for (const graph of [subjectGraph(spyroModel(parse), 'Spyro', { version: 1, semantic: SPYRO_SEMANTIC }), subjectGraph(spyroProvedModel(parse), 'Spyro', { version: 2, semantic: SPYRO_SEMANTIC })]) {
        let count = 0;
        for (const node of graph.nodes) {
          const lines = (node.lean.code ?? '').split('\n');
          for (const ref of node.lean.refs ?? []) {
            const text = lines[ref.range.start.line]?.slice(ref.range.start.character, ref.range.end.character) ?? '';
            expect(text.length, `${node.id} ${ref.name}`).toBeGreaterThan(0);
            expect(ref.name.endsWith(text), `${node.id}: "${text}" / ${ref.name}`).toBe(true);
            count++;
          }
        }
        expect(count).toBeGreaterThan(0);
      }
    });
  });
}

describe('the hand-written Spyro facts match the fixture text', () => {
  const check = (facts: LeanFacts, texts: Record<string, string>) => {
    for (const decl of facts.decls) {
      const lines = (texts[decl.file] ?? '').split('\n');
      const sel = lines[decl.selectionRange.start.line]?.slice(decl.selectionRange.start.character, decl.selectionRange.end.character) ?? '';
      if (!decl.name.includes('inst')) expect(decl.name.endsWith(sel), `${decl.name} selection "${sel}"`).toBe(true);
      expect(lines[decl.range.end.line]?.length, `${decl.name} ends at its line end`).toBe(decl.range.end.character);
      for (const ref of decl.refs) {
        const text = lines[ref.range.start.line]?.slice(ref.range.start.character, ref.range.end.character) ?? '';
        expect(ref.name.endsWith(text) && text.length > 0, `${decl.name}: ref ${ref.name} covers "${text}"`).toBe(true);
      }
    }
  };
  it('base and proved overlay', () => {
    check(spyroFacts(), { 'Model/Spyro/Main.lean': SPYRO_TEXTS.main, 'Model/Spyro/Vocabulary.lean': SPYRO_TEXTS.vocabulary });
    check(spyroProvedFacts(), { 'Model/Spyro/Main.lean': SPYRO_TEXTS.provedMain, 'Model/Spyro/Vocabulary.lean': SPYRO_TEXTS.vocabulary });
    // The derived variant also has Lean's `And.right` ref on the `.2` projection (not a suffix; never shown on a card).
    const derived = spyroDerivedFacts();
    for (const decl of derived.decls) decl.refs = decl.refs.filter((r) => r.name !== 'And.right');
    check(derived, { 'Model/Spyro/Main.lean': SPYRO_TEXTS.derivedMain, 'Model/Spyro/Vocabulary.lean': SPYRO_TEXTS.vocabulary });
  });
});
