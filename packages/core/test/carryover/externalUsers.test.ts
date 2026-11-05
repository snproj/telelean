/**
 * AT1.11 (M1 carry-over 1, docs/m2-plan.md section 1.3): subjectGraph fills `LeanBinding.externalUsers` with the users
 * of a card's statement and `.holds` that its board does not show: lemmas without a card and other subjects' cards.
 */
import { describe, expect, it } from 'vitest';
import { parseLeanFile } from '../../src/markup/api.js';
import type { TlGraph, TlNode } from '../../src/model.js';
import { buildProjectModel, subjectGraph } from '../../src/project/index.js';
import otherMain from '../fixtures/carryover/Other-Main.lean?raw';
import spyroLemmas from '../fixtures/carryover/Spyro-Lemmas.lean?raw';
import { MAIN, model, type ModelOptions, ROOT, type Texts, VOCAB } from '../gate/helpers/spyroRun.js';
import { fakeFacts, freshHashes } from '../project/helpers/fakeFacts.js';
import { SPYRO_TEXTS } from '../project/helpers/spyro.js';

const PROVED: Texts = { [ROOT]: SPYRO_TEXTS.root, [MAIN]: SPYRO_TEXTS.provedMain, [VOCAB]: SPYRO_TEXTS.vocabulary };
const WITH_USERS: Texts = {
  ...PROVED,
  [ROOT]: 'import Model.Spyro.Main\nimport Model.Spyro.Lemmas\nimport Model.Other.Main\n',
  'Model/Spyro/Lemmas.lean': spyroLemmas,
  'Model/Other/Main.lean': otherMain,
};

const board = (texts: Texts, subject = 'Spyro', options: ModelOptions = {}): TlGraph => subjectGraph(model(texts, options), subject, { version: 1, semantic: { state: 'fresh' } });
const card = (graph: TlGraph, id: string): TlNode => {
  const node = graph.nodes.find((n) => n.id === id);
  if (!node) throw new Error(`no card ${id}`);
  return node;
};

describe('AT1.11 externalUsers', () => {
  it('a lemma without a card (and one resting on it) and another subject\'s card using the .holds are listed', () => {
    const users = card(board(WITH_USERS), 'cynder-dark-past').lean.externalUsers;
    expect(users).toHaveLength(4);
    expect(users).toEqual(
      expect.arrayContaining([
        { name: 'Spyro.helper', where: 'proof' },
        // helper2's type mentions the statement, but its proof rests on the .holds (through helper): a proof use.
        { name: 'Spyro.helper2', where: 'proof' },
        { name: 'Other.other_dark.holds', nodeId: 'other-dark', subject: 'Other', naturalName: 'Somebody in the Spyro games has a dark past', where: 'proof' },
        { name: 'Other.other_dark', nodeId: 'other-dark', subject: 'Other', naturalName: 'Somebody in the Spyro games has a dark past', where: 'statement' },
      ]),
    );
    // Proof uses are listed before statement uses.
    expect(users?.map((u) => u.where)).toEqual(['proof', 'proof', 'proof', 'statement']);
  });

  it('users shown on the board (the proof of the goal) are not external; nothing outside: absent', () => {
    const graph = board(WITH_USERS);
    expect(card(graph, 'new-spyro-pg').lean.externalUsers).toBeUndefined();
    expect(card(graph, 'cynder-not-good').lean.externalUsers).toBeUndefined();
    expect(card(graph, 'pg-no-dark-past').lean.externalUsers).toBeUndefined();
    expect(card(board(PROVED), 'cynder-dark-past').lean.externalUsers).toBeUndefined();
    // On the other subject's board, the Spyro cards are not shown, and nothing uses other-dark.
    expect(card(board(WITH_USERS, 'Other'), 'other-dark').lean.externalUsers).toBeUndefined();
  });

  it('the Spyro goal proved on the other board is an external user of the Spyro assumptions it uses', () => {
    const otherUsesGoal = { ...WITH_USERS, 'Model/Other/Main.lean': otherMain.replace('theorem other_dark.holds : other_dark := Spyro.cynder_dark_past.holds', 'theorem other_dark.holds : other_dark := Spyro.cynder_dark_past.holds\ntheorem other_goal : Spyro.cynder_not_good := Spyro.cynder_not_good.holds') };
    expect(card(board(otherUsesGoal), 'cynder-not-good').lean.externalUsers).toEqual([{ name: 'Other.other_goal', where: 'proof' }]);
  });

  it('while files are stale, a use typed since the last check still counts (text scan)', () => {
    const typed: Texts = { ...PROVED, [ROOT]: 'import Model.Spyro.Main\nimport Model.Spyro.Lemmas\n', 'Model/Spyro/Lemmas.lean': spyroLemmas };
    const before: Texts = { ...typed, 'Model/Spyro/Lemmas.lean': 'import Model.Spyro.Main\n\nnamespace Spyro\nend Spyro\n' };
    const parse = (texts: Texts) => Object.entries(texts).map(([path, text]) => parseLeanFile(path, text));
    const files = parse(typed);
    const hashes = { ...freshHashes(files), 'Model/Spyro/Lemmas.lean': 'sha-typed-since' };
    const stale = buildProjectModel({ files, fileHashes: hashes, facts: fakeFacts(parse(before)), library: 'Model' });
    expect(stale.declFacts.has('Spyro.helper')).toBe(false);
    expect(stale.freshFiles.has('Model/Spyro/Lemmas.lean')).toBe(false);
    const graph = subjectGraph(stale, 'Spyro', { version: 1, semantic: { state: 'stale' } });
    expect(card(graph, 'cynder-dark-past').lean.externalUsers?.map((u) => u.name)).toEqual(['Spyro.helper', 'Spyro.helper2']);
    // With fresh facts of the same texts, the facts alone find them.
    expect(card(board(typed), 'cynder-dark-past').lean.externalUsers?.map((u) => u.name)).toEqual(['Spyro.helper', 'Spyro.helper2']);
  });

  it('without any facts, the text scan finds them too', () => {
    const users = card(board(WITH_USERS, 'Spyro', { facts: false }), 'cynder-dark-past').lean.externalUsers;
    expect(users?.map((u) => [u.name, u.nodeId ?? null])).toEqual(
      expect.arrayContaining([
        ['Spyro.helper', null],
        ['Spyro.helper2', null],
        ['Other.other_dark.holds', 'other-dark'],
      ]),
    );
  });

  it('the board copies cards: the model\'s nodes stay as they were', () => {
    const m = model(WITH_USERS);
    subjectGraph(m, 'Spyro', { version: 1, semantic: { state: 'fresh' } });
    expect(m.nodes.get('cynder-dark-past')?.node.lean.externalUsers).toBeUndefined();
  });
});
