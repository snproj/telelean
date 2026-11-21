/**
 * Slice 2a1 (docs/slice2-plan.md 1.1, 2.2, 2.3, 2.9): the review contracts reach core's public surface, item keys read
 * back, and a few texts are exactly the plan's.
 */
import { describe, expect, it } from 'vitest';
import * as core from '../../src/index.js';
import type { ActionOutcome, CascadeEntry, RunView } from '../../src/index.js';
import { arrowKey, cardKey, declKey, parseItemKey, premiseKey, proofKey, unarrowKey, vocabKey } from '../../src/review/keys.js';
import { CLAUDE_SESSION_TEXTS, ITEM_KIND_LABELS, ITEM_STATUS_TEXTS, REVIEW_TEXTS } from '../../src/review/texts.js';

describe('the review index', () => {
  it('exports every slice-2 core function of §2.9 (later sub-slices fill the stubs in their own modules)', () => {
    const names = [
      'computeItems',
      'premiseDraftKey',
      'constsOf',
      'reach',
      'statementReach',
      'reviewItemId',
      'classify',
      'itemDeps',
      'resultsState',
      'reconcile',
      'reduceReview',
      'planGroupAccept',
      'planGroupDecline',
      'permittedFor',
      'judgeState',
      'proposeArrowProblems',
      'applyBackstop',
      'planItemRevert',
      'planSubmit',
      'formalizeStartProblems',
      'formalizeOrder',
      'baseMask',
      'maskFacts',
      'buildSessionView',
    ];
    for (const name of names) expect(typeof (core as Record<string, unknown>)[name], name).toBe('function');
  });

  it('exports what the host and the runner share with the reducer (fixer 2a, V2A-S6): its gate, the reveal’s predicates, deps by id, labels', () => {
    for (const name of ['acceptGate', 'isMeaningItem', 'isResultOrPart', 'depsById', 'fallbackLabel']) {
      expect(typeof (core as Record<string, unknown>)[name], name).toBe('function');
    }
  });

  it('the additive contracts type-check: `refused`, a decision’s review outcome, a session’s RunView fields', () => {
    const cascade: CascadeEntry[] = [{ item: 'it0123456789abcdef', to: 'to-be-redone', why: 'it rests on it' }];
    const refused: ActionOutcome = { ok: false, code: 'refused', error: REVIEW_TEXTS.stepRunning };
    const confirm: ActionOutcome = { ok: false, code: 'needs-confirmation', error: REVIEW_TEXTS.cascadeReject, cascade, hiddenResults: true };
    const done: ActionOutcome = { ok: true, label: 'Accept: x', undoable: true, review: { taken: ['a'], left: [{ item: 'b', reason: 'depends' }], cascade } };
    const session: Pick<RunView, 'session' | 'inferences' | 'step'> = {
      session: { stage: 1, phase: 'stage' },
      inferences: [{ target: 't', premises: ['s'] }],
      step: { index: 1, of: 2, target: 't', kind: 'formalize', statementsFixed: true },
    };
    expect([refused.ok, confirm.ok, done.ok, session.session?.phase]).toEqual([false, false, true, 'stage']);
  });
});

describe('item keys (§2.2)', () => {
  it('read back into their parts', () => {
    expect(parseItemKey(cardKey('cynder-not-good'))).toEqual({ kind: 'card', node: 'cynder-not-good' });
    expect(parseItemKey(proofKey('t'))).toEqual({ kind: 'proof', node: 't' });
    expect(parseItemKey(premiseKey('t', 'cynder_is_evil'))).toEqual({ kind: 'premise', target: 't', leanName: 'cynder_is_evil' });
    expect(arrowKey('s', 't')).toBe('arrow:s>t');
    expect(parseItemKey(arrowKey('s', 't'))).toEqual({ kind: 'arrow', arrow: { source: 's', target: 't' } });
    expect(parseItemKey(unarrowKey('s', 't'))).toEqual({ kind: 'unarrow', arrow: { source: 's', target: 't' } });
    expect(parseItemKey(vocabKey('Spyro.IsEvil'))).toEqual({ kind: 'vocab', name: 'Spyro.IsEvil' });
    expect(parseItemKey(declKey('Spyro.instNonemptyT'))).toEqual({ kind: 'decl', name: 'Spyro.instNonemptyT' });
    for (const bad of ['', 'card:', 'nope:x', 'arrow:st', 'premise:t']) expect(parseItemKey(bad)).toBeUndefined();
  });
});

describe('texts (§0: used verbatim)', () => {
  it('holds the plan’s texts, with their placeholders filled', () => {
    expect(REVIEW_TEXTS.stepRunning).toBe("Claude's step is running: you can review when it ends.");
    expect(REVIEW_TEXTS.conflict('Formalize “T”')).toBe('“Formalize “T”” changed since you looked at it: look again.');
    expect(REVIEW_TEXTS.unowned('Spyro.lemma')).toBe('Spyro.lemma changed, but no review item covers it.');
    expect(REVIEW_TEXTS.counts(3, 5, 1, 0)).toBe('3 in review · 5 accepted · 1 declined');
    expect(REVIEW_TEXTS.counts(3, 5, 1, 1)).toBe('3 in review · 5 accepted · 1 declined · 1 to be redone');
    expect(REVIEW_TEXTS.exitConfirm(2, 3, true)).toBe(
      "Exit the edit session? This discards 2 accepted items and 3 items in review, and stops Claude's step. Your files are not changed; your answers to Claude's questions stay recorded. Exit cannot be undone.",
    );
    expect(REVIEW_TEXTS.sessionTitle(['T'])).toBe('Edit session · Formalize for dependencies: “T”');
    expect(REVIEW_TEXTS.sessionTitle(['A', 'B', 'C'])).toBe('Edit session · Formalize for dependencies · 3 targets');
    expect(REVIEW_TEXTS.reviewPhase(3, 5, true)).toBe('Review: 3 in review · 5 accepted · results after the review');
    expect(REVIEW_TEXTS.undoDecline('x', 'reject')).toBe('Decline: x (Reject)');
    expect(REVIEW_TEXTS.undoAcceptPremise('P', 'axiom')).toBe('Accept: Add premise P (as an axiom)');
    expect(ITEM_KIND_LABELS['add-arrow']).toBe('Add arrow');
    expect(ITEM_STATUS_TEXTS['to-be-redone']).toEqual({ glyph: '↻', word: 'to be redone' });
    expect(CLAUDE_SESSION_TEXTS.stepStatementsOnly(2, 3, 't', 'l')).toBe('Step 2 of 3: formalize the statements of “t” (no proof: “l” was not proved)');
    // §4.9's message for a stray comment (AP-26), quoted after 2a1 was built (V2A-N1).
    expect(CLAUDE_SESSION_TEXTS.strayComment('Model/Spyro/Main.lean', 12)).toBe(
      'Model/Spyro/Main.lean:12: this comment is not next to a declaration this step wrote or changed: put it directly above the declaration it describes, or remove it.',
    );
    // A label quotes what it names already (V2A-N2).
    expect(REVIEW_TEXTS.conflictLabel('Formalize “T”')).toBe('Formalize “T” changed since you looked at it: look again.');
  });
});
