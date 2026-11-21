/**
 * AT2.3: which facts the board uses (docs/m1-plan.md section 6.3): stale files keep their previous facts by name while
 * the keyword is unchanged; unchecked theorems never show as proved; failed / dependency-failed / not-built modules.
 */
import { describe, expect, it } from 'vitest';
import { buildProjectModel } from '../../src/project/index.js';
import { block, build, graphOf, mainS, nodeOf, VOCAB_S } from './helpers/build.js';
import { parseFixture } from './helpers/parseFixture.js';
import { SPYRO_PROVED_HASHES, SPYRO_TEXTS, spyroFiles, spyroProvedFacts } from './helpers/spyro.js';

/** The proved overlay, with Main.lean edited after the facts were computed. */
function staleProved(edit: (text: string) => string) {
  const main = edit(SPYRO_TEXTS.provedMain);
  return buildProjectModel({
    files: spyroFiles(parseFixture, main),
    fileHashes: { ...SPYRO_PROVED_HASHES, 'Model/Spyro/Main.lean': 'sha-typed-since' },
    facts: spyroProvedFacts(),
    library: 'Model',
  });
}

describe('AT2.3 stale files keep previous facts by name', () => {
  it('while the keyword is unchanged: same status, flag stale, refs dropped, uses/presupposes/axioms kept', () => {
    const model = staleProved((t) => t.replace('namespace Spyro\n', 'namespace Spyro\n\n-- a note typed since the last check\n'));
    expect(model.freshFiles.has('Model/Spyro/Main.lean')).toBe(false);
    const goal = nodeOf(model, 'cynder-not-good');
    expect(goal.status.proof.kind).toBe('proved');
    expect(goal.status.flags).toEqual(['stale']);
    expect(goal.lean.refs).toBeUndefined();
    expect(goal.lean.uses).toEqual(['Spyro.GoodAddition', 'Spyro.cynder', 'Spyro.newSpyro']);
    expect(goal.lean.presupposes).toEqual(['Spyro.Character.exists', 'Spyro.Game.exists']);
    expect(goal.lean.axioms).toHaveLength(11);
    // The code is the current text (one line lower), the facts' positions are not used.
    expect(goal.lean.codeLoc?.range.start.line).toBe(56);
    expect(nodeOf(model, 'cynder-dark-past').status).toMatchObject({ proof: { kind: 'assumed' }, flags: ['stale'] });
    // Edges by name: the verified arrows stay.
    expect(graphOf(model, 'Spyro').edges.filter((e) => e.type === 'verified').map((e) => e.source).sort()).toEqual(['cynder-dark-past', 'new-spyro-pg', 'pg-no-dark-past']);
  });

  it('a theorem whose keyword changed (axiom -> theorem) shows proof none + not-checked + stale, never proved', () => {
    const model = staleProved((t) => t.replace('axiom cynder_dark_past.holds : cynder_dark_past', 'theorem cynder_dark_past.holds : cynder_dark_past := sorry'));
    const node = nodeOf(model, 'cynder-dark-past');
    expect(node.status.proof).toEqual({ kind: 'none' });
    expect(node.status.flags).toEqual(['stale', 'not-checked']);
    expect(node.lean.justificationKind).toBe('theorem');
  });

  it('a theorem the facts do not know (typed since the check) shows proof none + not-checked + stale', () => {
    const model = staleProved((t) =>
      t.replace(
        'abbrev new_spyro_pg : Prop := IsPG newSpyro\naxiom new_spyro_pg.holds : new_spyro_pg',
        'abbrev new_spyro_pg : Prop := IsPG newSpyro\ntheorem new_spyro_pg.holds : new_spyro_pg := by\n  exact sorry',
      ),
    );
    const node = nodeOf(model, 'new-spyro-pg');
    expect(node.status.proof).toEqual({ kind: 'none' });
    expect(node.status.flags).toContain('not-checked');
    expect(node.status.flags).toContain('stale');
  });

  it('a theorem whose text changed but whose keyword did not keeps its previous facts until the next check', () => {
    const model = staleProved((t) => t.replace('theorem cynder_not_good.holds : cynder_not_good :=', 'theorem cynder_not_good.holds : cynder_not_good ∧ True :='));
    // Keyword unchanged: the previous facts still apply by name (the board keeps "proved" while the user types).
    expect(nodeOf(model, 'cynder-not-good').status.proof.kind).toBe('proved');
  });
});

describe('AT2.3 unchecked modules', () => {
  const body = [
    block({ id: 'a', type: 'ASSUMPTION', name: 'A holds', rationale: 'r', lean: 'S.a' }),
    'abbrev a : Prop := Good t',
    'axiom a.holds : a',
    '',
    block({ id: 'n', type: 'DERIVATION', name: 'N holds', premises: ['a'], lean: 'S.n' }),
    'abbrev n : Prop := Good t',
    'theorem n.holds : n := a.holds',
  ].join('\n');
  const texts = { 'Model.lean': 'import Model.S.Main\n', 'Model/S/Vocabulary.lean': VOCAB_S, 'Model/S/Main.lean': mainS(body) };

  for (const state of ['failed', 'dependency-failed', 'not-built'] as const) {
    it(`${state}: nodes get not-checked; an axiom still counts as assumed, a theorem as not proved`, () => {
      const model = build(texts, { facts: { moduleStates: { 'Model/S/Main.lean': state } } }).model;
      expect(nodeOf(model, 'a').status).toMatchObject({ formal: 'formalized', proof: { kind: 'assumed' }, flags: ['not-checked'] });
      expect(nodeOf(model, 'n').status).toMatchObject({ formal: 'formalized', proof: { kind: 'none' }, flags: ['not-checked'] });
      expect(nodeOf(model, 'n').lean.uses).toBeUndefined();
      expect(nodeOf(model, 'n').lean.refs).toBeUndefined();
      expect(nodeOf(model, 'n').lean.code).toBe('abbrev n : Prop := Good t\ntheorem n.holds : n := a.holds');
    });
  }

  it('no facts at all: syntactic mode, nothing proved, vocabulary from the text', () => {
    const model = build(texts, { facts: false }).model;
    expect(model.freshFiles.size).toBe(0);
    expect(nodeOf(model, 'a').status).toMatchObject({ formal: 'formalized', proof: { kind: 'assumed' }, flags: ['not-checked'] });
    expect(nodeOf(model, 'n').status).toMatchObject({ formal: 'formalized', proof: { kind: 'none' }, flags: ['not-checked'] });
    expect(model.vocabulary.map((v) => [v.name, v.kind])).toEqual([
      ['S.T', 'sort'],
      ['S.Good', 'predicate'],
      ['S.Bad', 'predicate'],
      ['S.t', 'constant'],
      ['S.T.exists', 'presupposition'],
    ]);
  });
});
