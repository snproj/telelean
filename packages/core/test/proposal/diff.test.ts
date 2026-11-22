/**
 * AT1.9 (docs/m2-plan.md section 4.5): diffGraphs, the proposal overlay's diff marks, on the walkthrough's boards.
 */
import { describe, expect, it } from 'vitest';
import { planGhostAdoption } from '../../src/gate/index.js';
import type { TlGraph } from '../../src/model.js';
import { diffGraphs } from '../../src/proposal/index.js';
import { subjectGraph } from '../../src/project/index.js';
import { BASE, edit, literal, MAIN, model, pinned, proved, type Texts } from '../gate/helpers/spyroRun.js';

const graph = (texts: Texts): TlGraph => subjectGraph(model(texts), 'Spyro', { version: 1, semantic: { state: 'fresh' } });
const current = graph(BASE);

describe('AT1.9 diffGraphs', () => {
  it('the normative proposal: pg-no-dark-past changed (statement, binding), the target changed (proof, status), new verified edges', () => {
    const diff = diffGraphs(current, graph(pinned(proved())));
    expect(diff.nodes).toEqual({
      'pg-no-dark-past': { change: 'changed', fields: ['statement', 'binding'] },
      'cynder-not-good': { change: 'changed', fields: ['proof', 'status'] },
    });
    expect(Object.keys(diff.nodes)).toEqual(['pg-no-dark-past', 'cynder-not-good']);
    expect(diff.vocabulary).toEqual({});
    expect(diff.edges.added).toEqual(expect.arrayContaining(['verified:cynder-dark-past->cynder-not-good', 'verified:new-spyro-pg->cynder-not-good', 'verified:pg-no-dark-past->cynder-not-good']));
    expect(diff.edges.removed).toEqual([]);
    expect(diff.counts).toEqual({ added: 0, changed: 2, removed: 0, vocabularyAdded: 0 });
  });

  it('the literal proposal adds vocabulary; an adopted ghost is an added node', () => {
    const literalTexts = pinned(literal());
    const diff = diffGraphs(current, graph(literalTexts));
    expect(diff.vocabulary).toEqual({ 'Spyro.InGame': 'added' });
    expect(diff.counts).toEqual({ added: 0, changed: 1, removed: 0, vocabularyAdded: 1 });
    const plan = planGhostAdoption(model(literalTexts), {
      subject: 'Spyro',
      target: 'cynder-not-good',
      naturalName: 'A character who cannot be in a game would not be a good addition to it',
      leanStatement: '∀ (c : Character) (g : Game), ¬ InGame c g → ¬ GoodAddition c g',
      session: 'r1',
      today: '2026-11-02',
      holdAs: 'axiom',
    });
    const adopted = diffGraphs(current, graph({ ...literalTexts, [MAIN]: plan.changes[0]?.after as string }));
    expect(adopted.nodes[plan.nodeId]).toEqual({ change: 'added', fields: [] });
    expect(adopted.counts.added).toBe(1);
    // Fixer round 1: adoption declares the new card as a premise of the goal, so the goal changed (premises).
    expect(adopted.nodes['cynder-not-good']).toMatchObject({ change: 'changed', fields: expect.arrayContaining(['premises']) });
    // Keys in the proposed board's node order (layout, then column order): the new assumption before the goal.
    expect(Object.keys(adopted.nodes)).toEqual(['pg-no-dark-past', plan.nodeId, 'cynder-not-good']);
  });

  it('removed nodes come last; sentence, type, premises and other fields are told apart', () => {
    const changedTexts = edit(
      edit(
        edit(edit(BASE, MAIN, 'natural_name: Cynder is a character who has a dark past', 'natural_name: Cynder had a dark past'), MAIN, 'id: pg-no-dark-past\ntype: ASSUMPTION', 'id: pg-no-dark-past\ntype: GOAL'),
        MAIN,
        'premises: cynder-dark-past, new-spyro-pg, pg-no-dark-past',
        'premises: cynder-dark-past, new-spyro-pg',
      ),
      MAIN,
      'rationale: known from gaming news',
      'rationale: read it somewhere',
    );
    const diff = diffGraphs(current, graph(changedTexts));
    expect(diff.nodes['cynder-dark-past']).toEqual({ change: 'changed', fields: ['sentence'] });
    expect(diff.nodes['pg-no-dark-past']?.fields).toEqual(expect.arrayContaining(['type']));
    expect(diff.nodes['new-spyro-pg']).toEqual({ change: 'changed', fields: ['fields'] });
    expect(diff.nodes['cynder-not-good']?.fields).toEqual(expect.arrayContaining(['premises']));
    expect(diff.edges.removed).toEqual(['premise:pg-no-dark-past->cynder-not-good']);
    const removed = edit(BASE, MAIN, '/-\n@@ telelean v1\nid: pg-no-dark-past\ntype: ASSUMPTION\nnatural_name: PG games cannot have characters with dark pasts\nstance: rule\nasserted: 2026-11-01\n-/\n\n', '');
    const gone = diffGraphs(current, graph(removed));
    expect(gone.nodes['pg-no-dark-past']).toEqual({ change: 'removed', fields: [] });
    expect(Object.keys(gone.nodes).at(-1)).toBe('pg-no-dark-past');
    expect(gone.counts.removed).toBe(1);
  });

  it('vocabulary changed and removed, by name; identical boards give an empty diff', () => {
    const vocabChanged = edit(edit(BASE, 'Model/Spyro/Vocabulary.lean', 'axiom IsPG : Game → Prop', 'axiom IsPG : Game → Character → Prop'), 'Model/Spyro/Vocabulary.lean', '/-- has a dark past -/\naxiom HasDarkPast : Character → Prop\n', '');
    const diff = diffGraphs(current, graph(vocabChanged));
    expect(diff.vocabulary).toEqual({ 'Spyro.IsPG': 'changed', 'Spyro.HasDarkPast': 'removed' });
    expect(diffGraphs(current, graph(BASE))).toEqual({ nodes: {}, vocabulary: {}, edges: { added: [], removed: [] }, counts: { added: 0, changed: 0, removed: 0, vocabularyAdded: 0 } });
  });
});
