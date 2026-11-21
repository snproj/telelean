/**
 * The gate rules on REAL Lean facts (Lake 5.0 / Lean 4.35.0, recorded in test-fixtures/semantic/recorded by the M1
 * semantic-layer work), not the fakeFacts approximation: B = the Spyro sample, S = the "extras" overlay (the proved
 * goal plus conditional proofs, an untracked lemma, a sorry theorem, a hidden assumption, axioms of the wrong shape,
 * a definition used by an abbrev, a structure, an orphan module), as if Claude had written all of it.
 */
import { describe, expect, it } from 'vitest';
import type { LeanFacts } from '../../src/facts.js';
import { computePermittedAxioms, evaluateRules, frozenSnapshot } from '../../src/gate/index.js';
import { parseLeanFile } from '../../src/markup/api.js';
import { buildProjectModel, subjectGraph, type ProjectModel } from '../../src/project/index.js';
import extrasMain from '../../../../test-fixtures/semantic/overlays/extras/Model/Spyro/Main.lean?raw';
import extrasOrphan from '../../../../test-fixtures/semantic/overlays/extras/Model/Spyro/Orphan.lean?raw';
import extrasFactsJson from '../../../../test-fixtures/semantic/recorded/extras-facts.json?raw';
import spyroFactsJson from '../../../../test-fixtures/semantic/recorded/spyro-facts.json?raw';
import { BASE, MAIN, SEL, SEL_NO_PG, type Texts } from './helpers/spyroRun.js';

/** A model of `texts` with recorded facts; every file is fresh (its hash is the one the build saw). */
function recorded(texts: Texts, facts: LeanFacts): ProjectModel {
  const files = Object.entries(texts).map(([path, text]) => parseLeanFile(path, text));
  const fileHashes = Object.fromEntries(facts.modules.map((m) => [m.file, m.sourceSha256]));
  return buildProjectModel({ files, fileHashes, facts, library: 'Model' });
}

const B = recorded(BASE, JSON.parse(spyroFactsJson) as LeanFacts);
const S = recorded({ ...BASE, [MAIN]: extrasMain, 'Model/Spyro/Orphan.lean': extrasOrphan }, JSON.parse(extrasFactsJson) as LeanFacts);

describe('gate rules on recorded real Lean facts', () => {
  it('the recorded models are fresh', () => {
    expect([...B.freshFiles].sort()).toEqual(['Model.lean', 'Model/Spyro/Main.lean', 'Model/Spyro/Vocabulary.lean']);
    expect(S.freshFiles.has(MAIN)).toBe(true);
  });

  it('the permitted set from real facts: the signature by Lean\'s typeSort, an unformalised premise unusable', () => {
    const permitted = computePermittedAxioms(B, SEL);
    expect(permitted.signature).toEqual(['Spyro.Character', 'Spyro.Game', 'Spyro.GoodAddition', 'Spyro.HasDarkPast', 'Spyro.IsPG']);
    expect(permitted.selected).toEqual(['Spyro.cynder_dark_past.holds', 'Spyro.new_spyro_pg.holds']);
    expect(permitted.presuppositions).toEqual(['Spyro.Character.exists', 'Spyro.Game.exists']);
    expect(permitted.unusable).toEqual(['pg-no-dark-past']);
    expect(permitted.all).toHaveLength(12);
  });

  it('unchanged declarations keep their real facts: no "meaning changed" finding; the presupposition instances (typed Prop by Lean) are no proofs', () => {
    const report = evaluateRules({ purpose: 'check', stage: 'formalise', selection: SEL, base: B, current: B, teleleanBlocks: [] });
    expect(report.findings).toEqual([]);
  });

  it('Claude writing the extras: exactly the expected findings, and nothing about the user\'s unchanged declarations', () => {
    const report = evaluateRules({ purpose: 'gate-other', stage: 'prove', selection: SEL, base: B, current: S, teleleanBlocks: [] });
    expect(report.findings.map((f) => [f.code, f.names?.[0] ?? f.file])).toEqual([
      ['build', 'Model/Spyro/Orphan.lean'],
      ['new-axiom', 'Spyro.hidden'],
      ['status-mismatch', 'Spyro.cynder_not_good.holds'],
      // Fixer round 1 (fail closed): Lean reports nothing about a `private` declaration, so it cannot be checked.
      ['footprint', 'Spyro.secret_helper'],
      // Slice 1e (spec v4.1 B.2): the run's proof of the target is judged at gate-other too. Slice 1g: the recordings
      // now hold the value probe's `valueConsts`, so B.2 sees what the proof uses directly (the three selected
      // premises' .holds): no `undeclared-premise` finding (it was `source-only` while the recordings predated the probe).
      ['sorry-axiom', 'Spyro.withSorry'],
      // In the vocabulary group's order (functions before constants).
      ['vocabulary-shape', 'Spyro.f'],
      ['vocabulary-shape', 'Spyro.c2'],
    ]);
    expect(report.formalisedThisRun).toEqual(['pg-no-dark-past']);
    expect(report.flaggedDefinitions).toEqual([]);
    expect(report.footprints['Spyro.d0.holds']).toEqual(expect.arrayContaining(['Spyro.cynder_dark_past.holds', 'Spyro.new_spyro_pg.holds']));
  });

  it('without new-spyro-pg selected, every proof resting on it is reported (the target\'s and the lemmas\')', () => {
    const report = evaluateRules({ purpose: 'gate-other', stage: 'prove', selection: SEL_NO_PG, base: B, current: S, teleleanBlocks: [] });
    expect(report.findings.filter((f) => f.code === 'footprint' && f.token !== 'no-facts').map((f) => [f.message.split(' rests on')[0]?.split(': ').pop(), f.names])).toEqual([
      ['Spyro.cynder_not_good.holds', ['Spyro.new_spyro_pg.holds']],
      ['Spyro.d0.holds', ['Spyro.new_spyro_pg.holds']],
      ['Spyro.g2.holds', ['Spyro.new_spyro_pg.holds']],
    ]);
  });

  it('B.2 on Lean\'s elaborated values: the target\'s proof uses new-spyro-pg\'s .holds directly, which is not selected (gate-other and gate-proved)', () => {
    // Slice 1g (fixer): the recordings hold the value probe's `valueConsts`, so B.2 sees what the proof uses directly.
    for (const purpose of ['gate-other', 'gate-proved'] as const) {
      const report = evaluateRules({ purpose, stage: 'prove', selection: SEL_NO_PG, base: B, current: S, teleleanBlocks: [] });
      const b2 = report.findings.filter((f) => f.code === 'undeclared-premise');
      expect(b2.map((f) => ({ token: f.token, nodeId: f.nodeId, names: f.names })), purpose).toEqual([{ token: 'unselected', nodeId: 'new-spyro-pg', names: ['Spyro.new_spyro_pg.holds'] }]);
    }
  });

  it('carry-over 1 on real references: the untracked lemmas resting on an assumption are its external users', () => {
    const graph = subjectGraph(S, 'Spyro', { version: 1, semantic: { state: 'fresh' } });
    const users = graph.nodes.find((n) => n.id === 'cynder-dark-past')?.lean.externalUsers ?? [];
    expect(users.map((u) => u.name)).toEqual(expect.arrayContaining(['Spyro.helper_lemma', 'Spyro.d0.holds', 'Spyro.g3.holds', 'Spyro.g2.holds']));
    expect(users.every((u) => u.nodeId === undefined)).toBe(true);
    expect(users.find((u) => u.name === 'Spyro.helper_lemma')?.where).toBe('proof');
    // The goal's proof is on the board: not external.
    expect(users.map((u) => u.name)).not.toContain('Spyro.cynder_not_good.holds');
  });

  it('a freeze of the real facts records the statements with Lean\'s own value strings', () => {
    const snapshot = frozenSnapshot(S, SEL, 1);
    expect(snapshot.declarations['Spyro.cynder_not_good']).toEqual({ kind: 'def', type: 'Prop', value: '¬Spyro.GoodAddition Spyro.cynder Spyro.newSpyro' });
    expect(snapshot.declarations['Spyro.instNonemptyCharacter']).toMatchObject({ kind: 'instance', type: 'Nonempty Spyro.Character' });
    const after = evaluateRules({ purpose: 'gate-proved', stage: 'prove', selection: SEL, base: B, current: S, teleleanBlocks: [], freeze: snapshot });
    expect(after.findings.map((f) => f.code)).not.toContain('statement-changed');
    expect(after.findings.map((f) => f.code)).not.toContain('not-proved');
  });
});
