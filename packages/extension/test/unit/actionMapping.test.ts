import { parseWebviewToHost, type BoardAction, type WebviewToHostMessage } from '@telelean/core';
import { describe, expect, it } from 'vitest';

import { ACTION_MESSAGE_TYPES, isActionMessage, requestIdOf, toBoardAction, type ActionMessage } from '../../src/logic/actionMapping';

/** Builds a message the way the host receives it: through core's validator. */
function message(type: string, payload: Record<string, unknown>): WebviewToHostMessage {
  const parsed = parseWebviewToHost({ v: 1, type, payload });
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.value;
}

function action(type: string, payload: Record<string, unknown>, subject = 'Spyro'): BoardAction | undefined {
  const m = message(type, payload);
  if (!isActionMessage(m)) throw new Error(`${type} is not an action message`);
  return toBoardAction(m, subject);
}

describe('protocol message -> BoardAction (AT5.7)', () => {
  it('addNode becomes add-node in the board subject; clientId never becomes the id', () => {
    expect(
      action('addNode', {
        clientId: 'tmp-1',
        type: 'AXIOM',
        naturalName: '  Cynder is a dragon ',
        requestId: 'r1',
        rationale: ' seen it ',
        stance: 'believe',
        source: 'observed',
      }),
    ).toEqual({
      kind: 'add-node',
      subject: 'Spyro',
      type: 'AXIOM',
      naturalName: '  Cynder is a dragon ',
      rationale: 'seen it',
      stance: 'believe',
      source: 'observed',
    });
    const minimal = action('addNode', { clientId: 'tmp-2', type: 'PROPOSITION', naturalName: 'g' }, 'Other');
    expect(minimal).toEqual({ kind: 'add-node', subject: 'Other', type: 'PROPOSITION', naturalName: 'g' });
    expect(minimal).not.toHaveProperty('preferredId');
    // Spec v4 slice 1c: a new proposition's place on the canvas goes to the planner (it writes layout.json).
    expect(action('addNode', { clientId: 'tmp-3', type: 'PROPOSITION', naturalName: 'g', position: { x: 12, y: -3.5 } })).toEqual({
      kind: 'add-node',
      subject: 'Spyro',
      type: 'PROPOSITION',
      naturalName: 'g',
      position: { x: 12, y: -3.5 },
    });
  });

  it('kindChange becomes change-kind (with the dependents choice and rationale when given)', () => {
    expect(action('kindChange', { id: 'cynder-not-good', from: 'PROPOSITION', to: 'AXIOM', beforeId: null, requestId: 'r2', rationale: 'because' })).toEqual({
      kind: 'change-kind',
      id: 'cynder-not-good',
      to: 'AXIOM',
      beforeId: null,
      rationale: 'because',
    });
    // The mapping passes A->P on too: refusing it is the planner's job (spec v4 AR-6).
    expect(action('kindChange', { id: 'a', from: 'AXIOM', to: 'PROPOSITION', beforeId: 'b', dependents: 'mark-broken' })).toEqual({
      kind: 'change-kind',
      id: 'a',
      to: 'PROPOSITION',
      beforeId: 'b',
      dependents: 'mark-broken',
    });
  });

  it('M2 carry-over 3: kindChange.confirmedDependents (the dependents the dialog listed) reaches change-kind (AT5.7)', () => {
    expect(
      action('kindChange', {
        id: 'cynder-not-good',
        from: 'PROPOSITION',
        to: 'AXIOM',
        beforeId: null,
        dependents: 'rewrite',
        confirmedDependents: ['cynder-not-good', 'Spyro.helper_lemma'],
        requestId: 'k1',
      }),
    ).toEqual({
      kind: 'change-kind',
      id: 'cynder-not-good',
      to: 'AXIOM',
      beforeId: null,
      dependents: 'rewrite',
      confirmedDependents: ['cynder-not-good', 'Spyro.helper_lemma'],
    });
    // An empty list is a statement too ("the dialog listed none"): core then refuses if it finds any.
    expect(action('kindChange', { id: 'a', from: 'PROPOSITION', to: 'AXIOM', beforeId: null, dependents: 'mark-broken', confirmedDependents: [] })).toMatchObject({
      dependents: 'mark-broken',
      confirmedDependents: [],
    });
    // Absent stays absent (core treats a choice without a list as "the dialog listed none").
    expect(action('kindChange', { id: 'a', from: 'PROPOSITION', to: 'AXIOM', beforeId: null, dependents: 'rewrite' })).not.toHaveProperty('confirmedDependents');
  });

  it('theseSuffice becomes set-premises; with no premises there is no action (not-yet, M2)', () => {
    expect(action('theseSuffice', { premises: ['a', 'b'], target: 'g', requestId: 'r3' })).toEqual({ kind: 'set-premises', target: 'g', premises: ['a', 'b'] });
    expect(action('theseSuffice', { premises: [], target: 'g' })).toBeUndefined();
  });

  it('editNode, deleteNode, reorder and createSubject map one to one', () => {
    expect(action('editNode', { id: 'n', field: 'naturalName', value: 'New words' })).toEqual({ kind: 'edit-node', id: 'n', field: 'naturalName', value: 'New words' });
    expect(action('editNode', { id: 'n', field: 'rationale', value: null })).toEqual({ kind: 'edit-node', id: 'n', field: 'rationale', value: null });
    expect(action('editNode', { id: 'n', field: 'stance', value: 'rule' })).toEqual({ kind: 'edit-node', id: 'n', field: 'stance', value: 'rule' });
    expect(action('editNode', { id: 'n', field: 'source', value: 'common' })).toEqual({ kind: 'edit-node', id: 'n', field: 'source', value: 'common' });
    expect(action('deleteNode', { id: 'n', keepLean: true })).toEqual({ kind: 'delete-node', id: 'n', keepLean: true });
    expect(action('reorder', { id: 'n', column: 'PROPOSITION', beforeId: 'm' })).toEqual({ kind: 'reorder', id: 'n', column: 'PROPOSITION', beforeId: 'm' });
    expect(action('createSubject', { name: 'Bayonetta' })).toEqual({ kind: 'create-subject', name: 'Bayonetta' });
  });

  it('deleteNode keeps "confirmed" (Delete anyway after the needs-confirmation list); without it there is none', () => {
    // The webview's resend after the host listed the declarations that use the card's Lean code.
    expect(action('deleteNode', { id: 'cynder-dark-past', keepLean: false, confirmed: true, requestId: 'r9' })).toEqual({
      kind: 'delete-node',
      id: 'cynder-dark-past',
      keepLean: false,
      confirmed: true,
    });
    const first = action('deleteNode', { id: 'cynder-dark-past', keepLean: false, requestId: 'r8' });
    expect(first).toEqual({ kind: 'delete-node', id: 'cynder-dark-past', keepLean: false });
    expect(first).not.toHaveProperty('confirmed');
    expect(action('deleteNode', { id: 'n', keepLean: false, confirmed: false })).not.toHaveProperty('confirmed');
    expect(() => message('deleteNode', { id: 'n', keepLean: false, confirmed: 'yes' })).toThrow(/confirmed/);
  });

  it('classifies exactly the mutating board edits as action messages', () => {
    const samples: Record<string, Record<string, unknown>> = {
      ready: { lastVersion: null },
      select: { ids: [] },
      undo: {},
      redo: {},
      selectSubject: { subject: 'Spyro' },
      historyList: { subject: 'Spyro' },
      initGit: {},
      copyText: { text: 'x' },
      openInEditor: { file: 'Model.lean' },
      refresh: {},
    };
    for (const [type, payload] of Object.entries(samples)) expect(isActionMessage(message(type, payload)), type).toBe(false);
    expect([...ACTION_MESSAGE_TYPES].sort()).toEqual([
      'addArrows',
      'addNode',
      'claimPending',
      'createSubject',
      'deleteNode',
      'editNode',
      'kindChange',
      'moveCards',
      'removeArrows',
      'reorder',
      'setFromNothing',
      'theseSuffice',
    ]);
  });

  it('spec v4 slice 1b: the arrow messages map one to one; `confirmed` only when true', () => {
    expect(action('addArrows', { target: 'cynder-not-good', sources: ['cynder-dark-past', 'new-spyro-pg'], requestId: 'a1' })).toEqual({
      kind: 'add-arrows',
      target: 'cynder-not-good',
      sources: ['cynder-dark-past', 'new-spyro-pg'],
    });
    expect(action('addArrows', { target: 'new-spyro-pg', sources: ['cynder-dark-past'], confirmed: true })).toEqual({
      kind: 'add-arrows',
      target: 'new-spyro-pg',
      sources: ['cynder-dark-past'],
      confirmed: true,
    });
    expect(action('addArrows', { target: 'g', sources: ['a'], confirmed: false })).not.toHaveProperty('confirmed');
    expect(action('removeArrows', { arrows: [{ source: 'pg-no-dark-past', target: 'cynder-not-good' }], confirmed: true, requestId: 'a2' })).toEqual({
      kind: 'remove-arrows',
      arrows: [{ source: 'pg-no-dark-past', target: 'cynder-not-good' }],
      confirmed: true,
    });
    expect(action('removeArrows', { arrows: [{ source: 'a', target: 'g' }] })).toEqual({ kind: 'remove-arrows', arrows: [{ source: 'a', target: 'g' }] });
    // Slice 1f (carry-over 2): the "follows from nothing" marks of the same Delete travel with it (one plan, one step).
    expect(action('removeArrows', { arrows: [{ source: 'a', target: 'g' }], marks: ['h'], confirmed: true })).toEqual({
      kind: 'remove-arrows',
      arrows: [{ source: 'a', target: 'g' }],
      marks: ['h'],
      confirmed: true,
    });
    expect(action('removeArrows', { arrows: [], marks: ['h', 'k'] })).toEqual({ kind: 'remove-arrows', arrows: [], marks: ['h', 'k'] });
    expect(action('removeArrows', { arrows: [{ source: 'a', target: 'g' }], marks: [] })).not.toHaveProperty('marks');
    expect(action('setFromNothing', { id: 'cynder-not-good', on: true })).toEqual({ kind: 'set-from-nothing', id: 'cynder-not-good', on: true });
    expect(action('setFromNothing', { id: 'new-spyro-pg', on: true, confirmed: true })).toEqual({ kind: 'set-from-nothing', id: 'new-spyro-pg', on: true, confirmed: true });
    expect(action('setFromNothing', { id: 'g', on: false })).toEqual({ kind: 'set-from-nothing', id: 'g', on: false });
    expect(action('claimPending', { id: 'cynder-not-good', requestId: 'a3' })).toEqual({ kind: 'claim-pending', id: 'cynder-not-good' });
    expect(action('moveCards', { positions: { 'cynder-not-good': { x: 12, y: -4.5 } }, requestId: 'a4' })).toEqual({
      kind: 'move-cards',
      positions: { 'cynder-not-good': { x: 12, y: -4.5 } },
    });
    // Validation happens in core before the mapping: a malformed message never becomes an action.
    expect(() => message('addArrows', { target: 'g', sources: ['g'] })).toThrow(/target/);
    expect(() => message('moveCards', { positions: { g: { x: 1e9, y: 0 } } })).toThrow(/finite number/);
  });

  it('reads the request id of any message that has one', () => {
    expect(requestIdOf(message('undo', { requestId: 'u-1' }))).toBe('u-1');
    expect(requestIdOf(message('undo', {}))).toBeUndefined();
    expect(requestIdOf(message('copyText', { text: 'x' }))).toBeUndefined();
    const m = message('deleteNode', { id: 'n', keepLean: false, requestId: 'd_2' }) as ActionMessage;
    expect(requestIdOf(m)).toBe('d_2');
  });
});
