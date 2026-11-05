/**
 * Fixer round 1 (M2 verification, gate lens): regression tests for the holes the gate verifier showed with real Lean.
 *  - P1/P6b: an axiom directly below the block of a selected code-less GOAL (or DERIVATION) premise becomes that
 *    card's "statement": it escaped new-axiom, vocabulary-shape and readiness, and a non-Prop one entered the permitted
 *    set's signature (`axiom side_goal : Empty` proves anything).
 *  - P2: a proof Claude writes for a selected GOAL/DERIVATION premise widened the permitted set it was judged against
 *    (derivation footprints from the current state), in a not-proved round and, after Feedback, in the next freeze.
 *  - P12: a run-added `private` theorem has no Lean facts and slipped past the footprint rule.
 *  - Ghost adoption declares the adopted card as a premise of the target; G5 accepts exactly telelean's line.
 */
import { describe, expect, it } from 'vitest';
import { computePermittedAxioms, evaluateRules, frozenSnapshot, planGhostAdoption, type RuleReport, type Selection } from '../../src/gate/index.js';
import { BASE, codes, edit, findingsOf, literal, MAIN, model, normative, pinned, rules, SEL, TARGET_LINE, type Texts } from './helpers/spyroRun.js';

const TARGET_BLOCK = '/-\n@@ telelean v1\nid: cynder-not-good';
const sideBlock = (type: 'GOAL' | 'DERIVATION') => `/-\n@@ telelean v1\nid: side-goal\ntype: ${type}\nnatural_name: Cynder's past is well known\nasserted: 2026-11-01\n-/\n`;
const SIDE_ANCHOR = "natural_name: Cynder's past is well known\nasserted: 2026-11-01\n-/\n";
/** B with a code-less sub-goal card the user wrote before the run (blank line after it: nothing bound). */
const withSide = (type: 'GOAL' | 'DERIVATION' = 'GOAL', texts: Texts = BASE): Texts => edit(texts, MAIN, TARGET_BLOCK, `${sideBlock(type)}\n${TARGET_BLOCK}`);
/** Claude's text directly below the sub-goal's block (adjacent: bound to it). */
const underSide = (texts: Texts, code: string): Texts => edit(texts, MAIN, `${SIDE_ANCHOR}\n`, `${SIDE_ANCHOR}${code}\n\n`);

const SEL_SIDE: Selection = { subject: 'Spyro', target: 'cynder-not-good', premises: ['side-goal'], adoptedGhosts: [] };
const SEL_P2: Selection = { subject: 'Spyro', target: 'cynder-not-good', premises: ['cynder-dark-past', 'pg-no-dark-past', 'side-goal'], adoptedGhosts: [] };

const has = (report: RuleReport, code: string) => expect(codes(report), JSON.stringify(report.findings.map((f) => f.message))).toContain(code);
const without = (report: RuleReport, code: string) => expect(codes(report), JSON.stringify(report.findings.map((f) => f.message))).not.toContain(code);

describe('P1/P6b: an axiom below a selected code-less GOAL or DERIVATION premise', () => {
  for (const type of ['GOAL', 'DERIVATION'] as const) {
    it(`${type}: \`axiom side_goal : Empty\` is a new-axiom (statement) and a malformed binding in every purpose, and never signature`, () => {
      const B = model(withSide(type));
      const cheat = underSide(withSide(type), 'axiom side_goal : Empty');
      const S = model(cheat, { facts: { overrides: { 'Spyro.side_goal': { typeSort: 'Type' } } } });
      expect(S.nodes.get('side-goal')?.node.lean.statement).toBe('Spyro.side_goal');
      for (const purpose of ['check', 'freeze', 'gate-proved', 'gate-other'] as const) {
        const report = evaluateRules({ purpose, stage: 'formalise', selection: SEL_SIDE, base: B, current: S, teleleanBlocks: [] });
        const [axiom] = findingsOf(report, 'new-axiom');
        expect(axiom, purpose).toMatchObject({ names: ['Spyro.side_goal'], token: 'statement', nodeId: 'side-goal' });
        expect(axiom?.message).toContain("so it would be that card's statement");
        expect(findingsOf(report, 'not-formalised').map((f) => [f.nodeId, f.token]), purpose).toEqual([['side-goal', 'malformed']]);
      }
      // The permitted set never takes a card's statement as signature, whatever its type.
      const permitted = computePermittedAxioms(S, SEL_SIDE, B);
      expect(permitted.signature).not.toContain('Spyro.side_goal');
      expect(permitted.all).not.toContain('Spyro.side_goal');
      expect(permitted.unusable).toEqual(['side-goal']);
    });
  }

  it('the target proved from it (as the probe did after the freeze) fails the footprint too', () => {
    const B = model(withSide());
    const cheat = edit(underSide(withSide(), 'axiom side_goal : Empty'), MAIN, TARGET_LINE, `${TARGET_LINE}theorem cynder_not_good.holds : cynder_not_good := Empty.elim side_goal\n`);
    const S = model(cheat, { facts: { overrides: { 'Spyro.side_goal': { typeSort: 'Type' } } } });
    const report = rules('gate-proved', 'prove', B, S, { selection: SEL_SIDE, freeze: frozenSnapshot(S, SEL_SIDE, 1, B) });
    expect(findingsOf(report, 'footprint').map((f) => f.names)).toEqual([['Spyro.side_goal']]);
  });

  it('P6b: a Prop-valued axiom there is a belief, also when the round finishes not proved', () => {
    const B = model(withSide());
    const S = model(underSide(withSide(), 'axiom side_goal : ¬ GoodAddition cynder newSpyro'));
    const report = evaluateRules({ purpose: 'gate-other', stage: 'formalise', selection: { ...SEL_SIDE, premises: ['cynder-dark-past', 'new-spyro-pg', 'pg-no-dark-past', 'side-goal'] }, base: B, current: S, teleleanBlocks: [] });
    expect(findingsOf(report, 'new-axiom').map((f) => [f.names, f.token])).toEqual([[['Spyro.side_goal'], 'belief']]);
    has(report, 'not-formalised');
  });

  it('a proper statement for the GOAL premise passes; vocabulary of its own still passes; an unclassifiable axiom does not', () => {
    const B = model(withSide());
    const honest = model(underSide(withSide(), "/-- Cynder's past is well known -/\nabbrev side_goal : Prop := HasDarkPast cynder"));
    const report = evaluateRules({ purpose: 'gate-other', stage: 'formalise', selection: SEL_SIDE, base: B, current: honest, teleleanBlocks: [] });
    without(report, 'new-axiom');
    without(report, 'not-formalised');
    // A new sort in the vocabulary (bound to no card) is vocabulary, not a new-axiom.
    const sort = model(edit(withSide(), 'Model/Spyro/Vocabulary.lean', '/-- Cynder -/', '/-- consoles -/\naxiom Console : Type\n/-- Cynder -/'));
    without(evaluateRules({ purpose: 'gate-other', stage: 'formalise', selection: SEL_SIDE, base: B, current: sort, teleleanBlocks: [] }), 'new-axiom');
    // `axiom bad : Empty` in the vocabulary: vocabulary of kind `other` (vocabulary-shape), never signature.
    const bad = model(edit(withSide(), 'Model/Spyro/Vocabulary.lean', '/-- Cynder -/', 'axiom bad : Empty\n/-- Cynder -/'), {
      facts: { overrides: { 'Spyro.bad': { typeSort: 'Type' } } },
    });
    const badReport = evaluateRules({ purpose: 'gate-other', stage: 'formalise', selection: SEL_SIDE, base: B, current: bad, teleleanBlocks: [] });
    has(badReport, 'vocabulary-shape');
    expect(computePermittedAxioms(bad, SEL_SIDE, B).signature).not.toContain('Spyro.bad');
  });
});

describe('P2: a proof Claude writes for a selected premise never widens the permitted set', () => {
  const side = "/-- Cynder's past is well known -/\nabbrev side_goal : Prop := new_spyro_pg\ntheorem side_goal.holds : side_goal := new_spyro_pg.holds";
  const round1 = () => underSide(withSide('GOAL', normative()), side);

  it('round 1 (not proved, no freeze): the premise proof resting on an unselected assumption is a footprint finding', () => {
    const B = model(withSide());
    const S = model(round1());
    const report = evaluateRules({ purpose: 'gate-other', stage: 'formalise', selection: SEL_P2, base: B, current: S, teleleanBlocks: [] });
    expect(findingsOf(report, 'footprint').map((f) => [f.names, f.message.includes('Spyro.side_goal.holds rests on')])).toEqual([[['Spyro.new_spyro_pg.holds'], true]]);
  });

  it('round 2 (after Feedback): the freeze computed with B does not take that proof\'s footprint; without B it would', () => {
    const B = model(withSide());
    const S = model(round1());
    const withBase = computePermittedAxioms(S, SEL_P2, B);
    expect(withBase.all).not.toContain('Spyro.new_spyro_pg.holds');
    expect(withBase.unusable).toEqual(['side-goal']);
    expect(withBase.derivationFootprints).toEqual([]);
    // The hole the verifier showed: computed from the current state alone, the run's own proof widens the set.
    expect(computePermittedAxioms(S, SEL_P2).all).toContain('Spyro.new_spyro_pg.holds');
    // So the target proved directly from the unselected assumption fails in round 2.
    const proved = model(edit(round1(), MAIN, TARGET_LINE, `${TARGET_LINE}theorem cynder_not_good.holds : cynder_not_good :=\n  pg_no_dark_past.holds newSpyro cynder new_spyro_pg.holds cynder_dark_past.holds\n`));
    const freeze = frozenSnapshot(S, SEL_P2, 2, B);
    const report = evaluateRules({ purpose: 'gate-proved', stage: 'prove', selection: SEL_P2, base: B, current: proved, roundStart: S, freeze, teleleanBlocks: [] });
    // Both the target's proof and the run's proof of the premise rest on the unselected assumption.
    expect(findingsOf(report, 'footprint').map((f) => [f.message.split(' rests on')[0]?.split(': ').pop(), f.names])).toEqual([
      ['Spyro.cynder_not_good.holds', ['Spyro.new_spyro_pg.holds']],
      ['Spyro.side_goal.holds', ['Spyro.new_spyro_pg.holds']],
    ]);
  });

  it('a premise proved from the selected premises in the run may be used as a lemma; the user\'s own proof from B still counts', () => {
    const B = model(withSide());
    const fair = underSide(withSide('GOAL', normative()), "/-- Cynder's past is well known -/\nabbrev side_goal : Prop := cynder_dark_past\ntheorem side_goal.holds : side_goal := cynder_dark_past.holds");
    const S = model(fair);
    without(evaluateRules({ purpose: 'gate-other', stage: 'formalise', selection: SEL_P2, base: B, current: S, teleleanBlocks: [] }), 'footprint');
    // The user had that proof in B: its footprint counts (it acts as a lemma), also with new-spyro-pg in it.
    const userB = model(round1());
    const permitted = computePermittedAxioms(userB, SEL_P2, userB);
    expect(permitted.derivationFootprints).toContain('Spyro.new_spyro_pg.holds');
    expect(permitted.unusable).toEqual([]);
    // ... but not once Claude changed that proof's text.
    const changed = model(edit(round1(), MAIN, 'theorem side_goal.holds : side_goal := new_spyro_pg.holds', 'theorem side_goal.holds : side_goal := (new_spyro_pg.holds)'));
    expect(computePermittedAxioms(changed, SEL_P2, userB).derivationFootprints).toEqual([]);
    expect(computePermittedAxioms(changed, SEL_P2, userB).unusable).toEqual(['side-goal']);
  });
});

describe('P12: a run-added declaration Lean reports nothing about fails closed', () => {
  const SEL_NO_PG: Selection = { ...SEL, premises: ['cynder-dark-past', 'pg-no-dark-past'] };
  const lemma = (code: string) => edit(pinned(normative()), MAIN, 'end Spyro', `${code}\n\nend Spyro`);

  it('a private theorem resting on an unselected assumption (no facts: Lean skips private names) is a footprint finding', () => {
    const B = model(BASE);
    const S = model(lemma('private theorem helper_priv : new_spyro_pg := new_spyro_pg.holds'), { facts: { overrides: { 'Spyro.helper_priv': { drop: true } } } });
    for (const purpose of ['gate-other', 'gate-proved', 'check'] as const) {
      const report = evaluateRules({ purpose, stage: 'prove', selection: SEL_NO_PG, base: B, current: S, teleleanBlocks: [] });
      const found = findingsOf(report, 'footprint').filter((f) => f.token === 'no-facts');
      expect(found.map((f) => f.names), purpose).toEqual([['Spyro.helper_priv']]);
      expect(found[0]?.message).toContain('remove `private`');
    }
  });

  it('a private Prop-valued def (no facts) is caught as well; the user\'s own unchanged private declaration is not', () => {
    const B = model(BASE);
    const S = model(lemma('private def helper_def : new_spyro_pg := new_spyro_pg.holds'), { facts: { overrides: { 'Spyro.helper_def': { drop: true } } } });
    const report = evaluateRules({ purpose: 'gate-other', stage: 'prove', selection: SEL_NO_PG, base: B, current: S, teleleanBlocks: [] });
    expect(findingsOf(report, 'footprint').map((f) => [f.names, f.token])).toEqual([[['Spyro.helper_def'], 'no-facts']]);
    const userOwn = edit(BASE, MAIN, 'end Spyro', 'private theorem mine : True := trivial\n\nend Spyro');
    const drop = { facts: { overrides: { 'Spyro.mine': { drop: true } } } };
    without(evaluateRules({ purpose: 'gate-other', stage: 'prove', selection: SEL_NO_PG, base: model(userOwn, drop), current: model(pinned(normative(userOwn)), drop), teleleanBlocks: [] }), 'footprint');
  });
});

describe('ghost adoption declares the adopted card on the target (G5 accepts exactly that line)', () => {
  const REQUEST = {
    subject: 'Spyro',
    target: 'cynder-not-good',
    naturalName: 'A character who cannot be in a game would not be a good addition to it',
    leanStatement: '∀ (c : Character) (g : Game), ¬ InGame c g → ¬ GoodAddition c g',
    leanName: 'not_in_game_not_good',
    session: 'r1',
    today: '2026-11-02',
  };

  it('after adoption: no markup finding for the target\'s premises; Claude changing them further is one', () => {
    const B = model(BASE);
    const before = pinned(literal());
    const plan = planGhostAdoption(model(before), REQUEST);
    const adoptedTexts: Texts = { ...before, [MAIN]: plan.changes[0]?.after as string };
    const A = model(adoptedTexts);
    const selection: Selection = { ...SEL, adoptedGhosts: [plan.nodeId] };
    const freeze = frozenSnapshot(A, selection, 2, B);
    const clean = evaluateRules({ purpose: 'freeze', stage: 'formalise', selection, base: B, adopted: A, current: A, roundStart: A, teleleanBlocks: [plan.nodeId] });
    expect(clean.findings).toEqual([]);
    expect(freeze.permitted.selected).toContain('Spyro.not_in_game_not_good.holds');
    // Claude drops a premise from the line telelean wrote: markup.
    const tampered = model(edit(adoptedTexts, MAIN, `premises: cynder-dark-past, new-spyro-pg, pg-no-dark-past, ${plan.nodeId}`, `premises: cynder-dark-past, pg-no-dark-past, ${plan.nodeId}`));
    const report = evaluateRules({ purpose: 'gate-other', stage: 'prove', selection, base: B, adopted: A, current: tampered, freeze, teleleanBlocks: [plan.nodeId] });
    expect(findingsOf(report, 'markup').map((f) => [f.nodeId, f.token])).toEqual([['cynder-not-good', 'premises']]);
    // Without an adoption the same kind of change is the agent's: markup.
    const noAdoption = model(edit(pinned(literal()), MAIN, 'premises: cynder-dark-past, new-spyro-pg, pg-no-dark-past', 'premises: cynder-dark-past, new-spyro-pg, pg-no-dark-past, cynder-dark-past-2'));
    expect(findingsOf(evaluateRules({ purpose: 'gate-other', stage: 'prove', selection: SEL, base: B, current: noAdoption, teleleanBlocks: [] }), 'markup').map((f) => f.token)).toEqual(['premises']);
  });
});
