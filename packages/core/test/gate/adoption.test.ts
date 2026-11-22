/**
 * AT1.6 (docs/m2-plan.md sections 3.8 and 4.9): planGhostAdoption writes Claude's suggested premise as a new AXIOM
 * card right before the target's block, with exactly the collapsed checked statement, and refuses unsafe text.
 */
import { describe, expect, it } from 'vitest';
import { ActionError } from '../../src/actions.js';
import { planGhostAdoption, type GhostAdoptionRequest } from '../../src/gate/index.js';
import { edit, literal, MAIN, model, pinned, type Texts } from './helpers/spyroRun.js';

const LITERAL = pinned(literal());
const SENTENCE = 'A character who cannot be in a game would not be a good addition to it';
const REQUEST: GhostAdoptionRequest = {
  subject: 'Spyro',
  target: 'cynder-not-good',
  naturalName: SENTENCE,
  leanStatement: '∀ (c : Character)\n    (g : Game),  ¬ InGame c g → ¬ GoodAddition c g',
  leanName: 'not_in_game_not_good',
  rationale: 'it seems obvious to me',
  session: 'rmabc123',
  today: '2026-11-02',
  holdAs: 'axiom',
};
const TARGET_BLOCK = '/-\n@@ telelean v1\nid: cynder-not-good';

const refusal = (fn: () => unknown): ActionError => {
  try {
    fn();
  } catch (error) {
    if (error instanceof ActionError) return error;
    throw error;
  }
  throw new Error('expected an ActionError');
};

describe('AT1.6 planGhostAdoption', () => {
  it('inserts the card, its docstring, abbrev and .holds right before the target\'s block, statement collapsed', () => {
    const plan = planGhostAdoption(model(LITERAL), REQUEST);
    expect(plan).toMatchObject({ nodeId: 'a-character-who-cannot-be-in', leanName: 'Spyro.not_in_game_not_good' });
    const inserted = [
      '/-',
      '@@ telelean v1',
      'id: a-character-who-cannot-be-in',
      'type: AXIOM',
      `natural_name: ${SENTENCE}`,
      'rationale: it seems obvious to me',
      'asserted: 2026-11-02',
      'lean: Spyro.not_in_game_not_good',
      'origin: agent',
      'session: rmabc123',
      'worded_by: agent',
      '-/',
      `/-- ${SENTENCE} -/`,
      'abbrev not_in_game_not_good : Prop := ∀ (c : Character) (g : Game), ¬ InGame c g → ¬ GoodAddition c g',
      'axiom not_in_game_not_good.holds : not_in_game_not_good',
      '',
      '',
    ].join('\n');
    // Fixer round 1: the target's `premises:` gains the adopted card (the user adopted it for this target).
    const declared = (LITERAL[MAIN] as string)
      .replace(TARGET_BLOCK, `${inserted}${TARGET_BLOCK}`)
      .replace('premises: cynder-dark-past, new-spyro-pg, pg-no-dark-past\n', 'premises: cynder-dark-past, new-spyro-pg, pg-no-dark-past, a-character-who-cannot-be-in\n');
    expect(plan.changes).toEqual([{ path: MAIN, before: LITERAL[MAIN], after: declared }]);
  });

  it('declares the adopted card as a premise of the target, also when the target declared none (fixer round 1)', () => {
    const plan = planGhostAdoption(model(LITERAL), REQUEST);
    const m = model({ ...LITERAL, [MAIN]: plan.changes[0]?.after as string });
    expect(m.nodes.get('cynder-not-good')?.node.premises).toEqual(['cynder-dark-past', 'new-spyro-pg', 'pg-no-dark-past', plan.nodeId]);
    // A "Self-evident?" target without a `premises:` line gets one, in its FIELD_ORDER place.
    const bare = edit(LITERAL, MAIN, 'premises: cynder-dark-past, new-spyro-pg, pg-no-dark-past\n', '');
    const planBare = planGhostAdoption(model(bare), REQUEST);
    const after = planBare.changes[0]?.after as string;
    expect(after).toContain(`id: cynder-not-good\ntype: GOAL\nnatural_name: Cynder would not be a good addition to the new Spyro game\npremises: ${planBare.nodeId}\nasserted: 2026-11-01`);
    expect(model({ ...bare, [MAIN]: after }).nodes.get('cynder-not-good')?.node.premises).toEqual([planBare.nodeId]);
  });

  it('replaces the target\'s "follows from nothing" mark (spec v4 AR-5: accepting a premise removes it; slice 1a fixer)', () => {
    const marked = edit(LITERAL, MAIN, 'premises: cynder-dark-past, new-spyro-pg, pg-no-dark-past\n', 'follows_from: nothing\n');
    expect(model(marked).nodes.get('cynder-not-good')?.node.fromNothing).toBe(true);
    const plan = planGhostAdoption(model(marked), REQUEST);
    const after = plan.changes[0]?.after as string;
    expect(after).toContain(`id: cynder-not-good\ntype: GOAL\nnatural_name: Cynder would not be a good addition to the new Spyro game\npremises: ${plan.nodeId}\nasserted: 2026-11-01`);
    expect(after).not.toContain('follows_from');
    const target = model({ ...marked, [MAIN]: after }).nodes.get('cynder-not-good')?.node;
    expect(target?.premises).toEqual([plan.nodeId]);
    expect(target?.fromNothing).toBeUndefined();
  });

  it('the result parses to a new AXIOM card: worded by Claude, pinned, docstring = sentence, the checked statement', () => {
    const plan = planGhostAdoption(model(LITERAL), REQUEST);
    const after: Texts = { ...LITERAL, [MAIN]: plan.changes[0]?.after as string };
    const m = model(after);
    const entry = m.nodes.get(plan.nodeId);
    expect(entry?.node).toMatchObject({
      type: 'AXIOM',
      naturalName: SENTENCE,
      rationale: 'it seems obvious to me',
      asserted: '2026-11-02',
      provenance: { wordedBy: 'agent', endorsed: false, origin: 'agent', session: 'rmabc123' },
      lean: { binding: 'pinned', statement: 'Spyro.not_in_game_not_good', justification: 'Spyro.not_in_game_not_good.holds', justificationKind: 'axiom' },
      status: { formal: 'formalized', proof: { kind: 'assumed' } },
    });
    expect(entry?.statementDecl?.decl.docstring).toBe(SENTENCE);
    const decl = entry?.statementDecl?.decl;
    expect(decl && after[MAIN]?.slice(decl.span.start, decl.span.end)).toBe(`/-- ${SENTENCE} -/\nabbrev not_in_game_not_good : Prop := ∀ (c : Character) (g : Game), ¬ InGame c g → ¬ GoodAddition c g`);
    // Every other card keeps its binding.
    const before = model(LITERAL);
    for (const [id, old] of before.nodes) expect(m.nodes.get(id)?.node.lean.statement, id).toBe(old.node.lean.statement);
  });

  it('a taken, keyword or invalid lean_name gives the derived name (suffixed when that is taken too)', () => {
    const nameOf = (leanName: string | undefined, texts: Texts = LITERAL) => {
      const { leanName: _drop, ...rest } = REQUEST;
      void _drop;
      return planGhostAdoption(model(texts), { ...rest, ...(leanName !== undefined ? { leanName } : {}) }).leanName;
    };
    expect(nameOf('cynder_dark_past')).toBe('Spyro.a_character_who_cannot_be_in');
    expect(nameOf('theorem')).toBe('Spyro.a_character_who_cannot_be_in');
    expect(nameOf('not valid')).toBe('Spyro.a_character_who_cannot_be_in');
    expect(nameOf('Spyro.dotted')).toBe('Spyro.a_character_who_cannot_be_in');
    expect(nameOf(undefined)).toBe('Spyro.a_character_who_cannot_be_in');
    // A name the project already uses (here a declaration) is never shadowed.
    const used = edit(LITERAL, MAIN, 'end Spyro', 'def a_character_who_cannot_be_in : Nat := 1\n\nend Spyro');
    expect(nameOf(undefined, used)).toBe('Spyro.a_character_who_cannot_be_in_2');
    expect(nameOf('GoodAddition')).toBe('Spyro.a_character_who_cannot_be_in');
  });

  it('the node id is unique in the project', () => {
    const taken = edit(LITERAL, MAIN, 'end Spyro', '/-\n@@ telelean v1\nid: a-character-who-cannot-be-in\ntype: GOAL\nnatural_name: Something else\n-/\n\nend Spyro');
    expect(planGhostAdoption(model(taken), REQUEST).nodeId).toBe('a-character-who-cannot-be-in-2');
  });

  it('refuses comment delimiters, the injected statement of fact 8, bad metadata and unknown targets', () => {
    const comment = refusal(() => planGhostAdoption(model(LITERAL), { ...REQUEST, leanStatement: 'True -/ /- evil' }));
    expect(comment.code).toBe('invalid');
    expect(comment.message).toContain('comment delimiter');
    const injected = refusal(() => planGhostAdoption(model(LITERAL), { ...REQUEST, leanStatement: 'True) → True := fun _ => trivial\naxiom evil : False\nexample : (True' }));
    expect(injected.code).toBe('invalid');
    expect(refusal(() => planGhostAdoption(model(LITERAL), { ...REQUEST, leanStatement: 'sorry' })).code).toBe('invalid');
    expect(refusal(() => planGhostAdoption(model(LITERAL), { ...REQUEST, naturalName: 'two\nlines' })).code).toBe('invalid');
    expect(refusal(() => planGhostAdoption(model(LITERAL), { ...REQUEST, rationale: 'two\nlines' })).code).toBe('invalid');
    expect(refusal(() => planGhostAdoption(model(LITERAL), { ...REQUEST, today: 'yesterday' })).code).toBe('invalid');
    expect(refusal(() => planGhostAdoption(model(LITERAL), { ...REQUEST, session: 'bad session' })).code).toBe('invalid');
    expect(refusal(() => planGhostAdoption(model(LITERAL), { ...REQUEST, target: 'nope' })).code).toBe('not-found');
    expect(refusal(() => planGhostAdoption(model(LITERAL), { ...REQUEST, subject: 'Other' })).code).toBe('not-found');
  });

  it('2b2 (§3.8): `holdAs` as an axiom writes an AXIOM card (what M2\'s "I hold this" wrote)', () => {
    const asAxiom = planGhostAdoption(model(LITERAL), { ...REQUEST, holdAs: 'axiom' });
    const m = model({ ...LITERAL, [MAIN]: asAxiom.changes[0]?.after as string });
    expect(m.nodes.get(asAxiom.nodeId)?.node).toMatchObject({ type: 'AXIOM', lean: { justificationKind: 'axiom' }, status: { proof: { kind: 'assumed' } } });
  });

  it('2b2 (§3.8): `holdAs` pending writes a PROPOSITION card with `axiom P.holds`, pending proof and never green (A26), in Claude’s words, with its arrow and the mark removal', () => {
    const marked = edit(LITERAL, MAIN, 'premises: cynder-dark-past, new-spyro-pg, pg-no-dark-past\n', 'follows_from: nothing\n');
    const plan = planGhostAdoption(model(marked), { ...REQUEST, holdAs: 'pending' });
    const after = plan.changes[0]?.after as string;
    expect(after).toContain(
      [
        '/-',
        '@@ telelean v1',
        'id: a-character-who-cannot-be-in',
        'type: PROPOSITION',
        `natural_name: ${SENTENCE}`,
        'rationale: it seems obvious to me',
        'asserted: 2026-11-02',
        'lean: Spyro.not_in_game_not_good',
        'origin: agent',
        'session: rmabc123',
        'worded_by: agent',
        '-/',
        `/-- ${SENTENCE} -/`,
        'abbrev not_in_game_not_good : Prop := ∀ (c : Character) (g : Game), ¬ InGame c g → ¬ GoodAddition c g',
        'axiom not_in_game_not_good.holds : not_in_game_not_good',
      ].join('\n'),
    );
    expect(after).not.toContain('follows_from');
    const m = model({ ...marked, [MAIN]: after });
    const card = m.nodes.get(plan.nodeId)?.node;
    expect(card).toMatchObject({
      type: 'PROPOSITION',
      naturalName: SENTENCE,
      provenance: { wordedBy: 'agent', origin: 'agent', session: 'rmabc123' },
      lean: { binding: 'pinned', statement: 'Spyro.not_in_game_not_good', justification: 'Spyro.not_in_game_not_good.holds', justificationKind: 'axiom' },
      status: { formal: 'formalized', proof: { kind: 'pending' } },
    });
    expect(card?.status.flags).not.toContain('established');
    const target = m.nodes.get('cynder-not-good')?.node;
    expect(target?.premises).toEqual([plan.nodeId]);
    expect(target?.fromNothing).toBeUndefined();
  });

  it('2h (fixer 2b2 r1, S-V2B2-S2): `holdAs` is required: a request without it does not compile, and `undefined` past the type is refused (`invalid`), never written as an AXIOM card', () => {
    const { holdAs: _drop, ...without } = REQUEST;
    // @ts-expect-error -- the type requires the choice: a premise write that forgot it does not compile.
    const forgot: GhostAdoptionRequest = without;
    for (const request of [forgot, { ...REQUEST, holdAs: undefined as unknown as 'axiom' }]) {
      const error = refusal(() => planGhostAdoption(model(LITERAL), request));
      expect(error.code).toBe('invalid');
      expect(error.message).toBe('A premise is held as an axiom or as a proposition pending proof, not left unchosen.');
    }
  });

  it('2b2 (§3.8): any other `holdAs` is refused (`invalid`), and nothing is planned', () => {
    for (const holdAs of ['theorem', 'AXIOM', '', 'pending ']) {
      const error = refusal(() => planGhostAdoption(model(LITERAL), { ...REQUEST, holdAs: holdAs as unknown as 'axiom' }));
      expect(error.code, holdAs).toBe('invalid');
      expect(error.message, holdAs).toBe(`A premise is held as an axiom or as a proposition pending proof, not ${JSON.stringify(holdAs)}.`);
    }
  });

  it('a sentence with comment delimiters is written escaped, so the docstring and block stay one comment each', () => {
    const plan = planGhostAdoption(model(LITERAL), { ...REQUEST, naturalName: 'Being out of a game -/ means not good' });
    const after = plan.changes[0]?.after as string;
    expect(after).toContain('natural_name: "Being out of a game -\\/ means not good"');
    expect(after).toContain('/-- Being out of a game -\\/ means not good -/');
    expect(model({ ...LITERAL, [MAIN]: after }).nodes.get(plan.nodeId)?.node.naturalName).toBe('Being out of a game -/ means not good');
  });
});
