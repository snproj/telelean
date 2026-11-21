/**
 * Slice 2b1b (docs/slice2-plan.md 2.7): every new code and token of an edit session has a board sentence
 * (`describeFinding`), and the findings `judgeState` produces read as the board says them.
 */
import { describe, expect, it } from 'vitest';
import { describeFinding, type DescribeContext, type GateFinding, type GateFindingCode } from '../../src/gate/index.js';
import { judge, PROVED, SCOPE, freezeOf, withCode } from '../review/helpers/judge.js';
import { INFERENCE, MAIN, TARGET, append, edit } from '../review/helpers/session.js';
import { HONEST_PROOF } from './helpers/spyroRun.js';

const CTX: DescribeContext = {
  sentenceOf: (id) => ({ a: 'Card A', t: 'The target', u: 'Another target' })[id],
  nodeOfDecl: () => undefined,
  selected: [],
};
const say = (code: GateFindingCode, token?: string, over: Partial<GateFinding> = {}) =>
  describeFinding({ step: 'G3', code, message: 'm', ...(token !== undefined ? { token } : {}), ...over }, CTX);

describe('describeFinding for a session’s codes and tokens', () => {
  it('B.3 `arrow`, one sentence per token, naming the cards', () => {
    const arrow = { names: ['a'], nodeId: 't' };
    expect(say('arrow', 'not-target', arrow)).toBe('it added an arrow into “The target”, which this step was not proving');
    expect(say('arrow', 'into-axiom', arrow)).toBe('it added an arrow into the axiom “The target”');
    expect(say('arrow', 'mark', arrow)).toBe('it added an arrow into “The target”, which you marked as following from nothing');
    expect(say('arrow', 'no-holds', arrow)).toBe('it added an arrow from “Card A”, which has no proof and no claim');
    expect(say('arrow', 'declined', arrow)).toBe('it used the arrow from “Card A” into “The target”, which you declined');
    expect(say('arrow', 'cycle', arrow)).toBe('its arrows made a cycle');
    expect(say('arrow', 'unknown-card', { names: ['nope'], nodeId: 't' })).toBe('it added an arrow from something that is not a card of this subject (`nope`)');
    expect(say('arrow', 'drawn', arrow)).toBe('it proposed an arrow from “Card A” that is drawn already');
    expect(say('arrow', 'other-target', arrow)).toBe('it added an arrow from “Card A”, another card this session proves');
    expect(say('arrow', undefined, arrow)).toBe('it added an arrow into “The target” that is not allowed');
  });

  it('B.4 `holds-kind`, `rejected-repeat`, `stray-command`', () => {
    expect(say('holds-kind', 'theorem-to-axiom', { nodeId: 't' })).toBe('it turned the proof of “The target” into an axiom');
    expect(say('holds-kind', 'axiom-for-proposition', { nodeId: 't' })).toBe('it stated “The target” as an axiom instead of proving it');
    expect(say('holds-kind', 'type-changed', { nodeId: 't' })).toBe('it changed what the proof of “The target” proves');
    expect(say('rejected-repeat', 'rejected')).toBe('it proposed again a version you rejected');
    expect(say('rejected-repeat', 'premise')).toBe('it proposed again a premise you rejected');
    expect(say('rejected-repeat', 'arrow')).toBe('it proposed again an arrow you declined');
    expect(say('rejected-repeat', 'shaky-identical')).toBe('it proposed again exactly what you declined as Shaky');
    expect(say('stray-command', undefined, { names: ['open Classical'], file: 'Model/Spyro/Main.lean', range: { start: { line: 4, character: 0 }, end: { line: 4, character: 14 } } })).toBe(
      'it wrote a command outside any declaration (`open Classical`) in Model/Spyro/Main.lean line 5',
    );
    expect(say('stray-command', 'comment', { file: 'Model/Spyro/Main.lean' })).toBe('it left a comment next to nothing it wrote in Model/Spyro/Main.lean');
    // Builder 2b2 (carry-over R2-1): a comment that would go with a declaration the step may not change names it.
    expect(say('stray-command', 'comment', { names: ['Spyro.Evil'], file: 'Model/Spyro/Main.lean' })).toBe(
      'it left a comment that would go with `Evil`, which it may not change in Model/Spyro/Main.lean',
    );
  });

  it('the new tokens of existing codes: `existing-changed` `session`, `new-axiom` `type-changed`, `undeclared-premise` `other-result`; slice 1’s sentences unchanged', () => {
    expect(say('existing-changed', 'session', { names: ['Spyro.pg_no_dark_past'], file: 'Model/Spyro/Main.lean' })).toBe('it changed `pg_no_dark_past`, which an earlier step proposed and you are reviewing');
    expect(say('new-axiom', 'type-changed', { names: ['Spyro.cynder'], file: 'Model/Spyro/Vocabulary.lean' })).toBe('it added an axiom with the name of an existing declaration (`cynder`)');
    expect(say('undeclared-premise', 'other-result', { names: ['Spyro.t1_lemma'], nodeId: 'u', file: 'Model/Spyro/Main.lean' })).toBe('it used `t1_lemma`, which belongs to the proof of “Another target”');
    // G5's `premises` and `follows_from` are slice 1's tokens (the field's name): their sentence is slice 1's.
    expect(say('markup', 'premises', { nodeId: 't' })).toBe('it changed the card “The target”');
    expect(say('markup', 'follows_from', { nodeId: 't' })).toBe('it changed the card “The target”');
    // Slice 1's sentences are unchanged: `meaning` reads as any other change of an existing declaration.
    expect(say('existing-changed', 'meaning', { names: ['Spyro.x'], file: 'Model/Spyro/Main.lean' })).toBe('it changed an existing declaration (`x`)');
    expect(say('existing-changed', 'target', { names: ['Spyro.x'], file: 'Model/Spyro/Main.lean' })).toBe('it changed the statement it had to prove (a definition the frozen statement depends on changed: `x`)');
    expect(say('existing-changed', 'removed', { names: ['Spyro.x'], file: 'Model/Spyro/Main.lean' })).toBe('it removed an existing declaration (`x`)');
  });

  it('fixer 2b1b r1: `existing-changed` `closed-proof`, `text` and `unowned` (S-F4, A-ADV-3); `holds-kind` `not-target` and `axiom-to-theorem`; G5’s `lines`', () => {
    // Reworded by fixer 2b1b r2 (R1-3): the token stands for any change of the closed proof, a removal included.
    expect(say('existing-changed', 'closed-proof', { names: ['Spyro.t.holds'], nodeId: 't', file: 'Model/Spyro/Main.lean' })).toBe('it changed the proof of “The target”, which this step may not change');
    expect(say('existing-changed', 'text', { names: ['-- a note'], file: 'Model/Spyro/Main.lean' })).toBe('it removed or moved a line outside declarations (`-- a note`) in Model/Spyro/Main.lean');
    expect(say('existing-changed', 'text', {})).toBe('it removed or moved a line outside declarations');
    expect(say('existing-changed', 'unowned', { names: ['Spyro.x'], file: 'Model/Spyro/Main.lean' })).toBe('it made a change no review item can hold (`x`)');
    expect(say('existing-changed', 'unowned')).toBe('it made a change no review item can hold');
    expect(say('holds-kind', 'not-target', { nodeId: 'u' })).toBe('it wrote a proof of “Another target”, which it was not asked to prove');
    expect(say('holds-kind', 'axiom-to-theorem', { nodeId: 'a' })).toBe('it turned the claim of “Card A” into a proof');
    expect(say('markup', 'lines', { nodeId: 'a' })).toBe('it changed the card “Card A”');
  });

  it('fixer 2b1b r2 (R1-3): `closed-proof` reads as any change of the closed proof; `uncovered` content is no proposal the person reviews', () => {
    expect(say('existing-changed', 'uncovered', { names: ['Spyro.t2.holds'], file: 'Model/Spyro/Main.lean' })).toBe('it changed `t2.holds`, which an earlier step wrote');
    expect(say('existing-changed', 'uncovered')).toBe('it changed something, which an earlier step wrote');
    // The person's own proof removed by a step whose proof is closed, as judgeState reports it.
    const removed = edit(PROVED, MAIN, HONEST_PROOF, '');
    const j = judge(removed, { base: PROVED, stepStart: PROVED, scope: { ...SCOPE, fuzzyStatements: [], openProof: false }, purpose: 'check', stage: 'prove', freeze: freezeOf(PROVED, TARGET, INFERENCE.question.sources, PROVED) });
    const found = withCode(j.stepFindings, 'existing-changed');
    expect(found.map((f) => f.token)).toEqual(['closed-proof']);
    expect(found[0]?.message).toContain('It was removed.');
    expect(describeFinding(found[0] as GateFinding, CTX)).toBe('it changed the proof of the card `cynder-not-good`, which this step may not change');
  });

  it('a stray command judgeState found reads on the board as it says', () => {
    const j = judge(append(PROVED, MAIN, 'open Classical'), { purpose: 'check', stage: 'prove' });
    const finding = withCode(j.stepFindings, 'stray-command')[0] as GateFinding;
    expect(describeFinding(finding, CTX)).toMatch(/^it wrote a command outside any declaration \(`open Classical`\) in Model\/Spyro\/Main\.lean line \d+$/);
  });
});
