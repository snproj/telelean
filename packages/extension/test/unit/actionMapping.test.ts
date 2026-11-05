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
        type: 'ASSUMPTION',
        naturalName: '  Cynder is a dragon ',
        requestId: 'r1',
        rationale: ' seen it ',
        stance: 'believe',
        source: 'observed',
      }),
    ).toEqual({
      kind: 'add-node',
      subject: 'Spyro',
      type: 'ASSUMPTION',
      naturalName: '  Cynder is a dragon ',
      rationale: 'seen it',
      stance: 'believe',
      source: 'observed',
    });
    const minimal = action('addNode', { clientId: 'tmp-2', type: 'GOAL', naturalName: 'g' }, 'Other');
    expect(minimal).toEqual({ kind: 'add-node', subject: 'Other', type: 'GOAL', naturalName: 'g' });
    expect(minimal).not.toHaveProperty('preferredId');
  });

  it('kindChange becomes change-kind (with the dependents choice and rationale when given)', () => {
    expect(action('kindChange', { id: 'cynder-not-good', from: 'GOAL', to: 'ASSUMPTION', beforeId: null, requestId: 'r2', rationale: 'because' })).toEqual({
      kind: 'change-kind',
      id: 'cynder-not-good',
      to: 'ASSUMPTION',
      beforeId: null,
      rationale: 'because',
    });
    expect(action('kindChange', { id: 'a', from: 'ASSUMPTION', to: 'GOAL', beforeId: 'b', dependents: 'mark-broken' })).toEqual({
      kind: 'change-kind',
      id: 'a',
      to: 'GOAL',
      beforeId: 'b',
      dependents: 'mark-broken',
    });
  });

  it('M2 carry-over 3: kindChange.confirmedDependents (the dependents the dialog listed) reaches change-kind (AT5.7)', () => {
    expect(
      action('kindChange', {
        id: 'cynder-dark-past',
        from: 'ASSUMPTION',
        to: 'GOAL',
        beforeId: null,
        dependents: 'rewrite',
        confirmedDependents: ['cynder-not-good', 'Spyro.helper_lemma'],
        requestId: 'k1',
      }),
    ).toEqual({
      kind: 'change-kind',
      id: 'cynder-dark-past',
      to: 'GOAL',
      beforeId: null,
      dependents: 'rewrite',
      confirmedDependents: ['cynder-not-good', 'Spyro.helper_lemma'],
    });
    // An empty list is a statement too ("the dialog listed none"): core then refuses if it finds any.
    expect(action('kindChange', { id: 'a', from: 'ASSUMPTION', to: 'GOAL', beforeId: null, dependents: 'mark-broken', confirmedDependents: [] })).toMatchObject({
      dependents: 'mark-broken',
      confirmedDependents: [],
    });
    // Absent stays absent (core treats a choice without a list as "the dialog listed none").
    expect(action('kindChange', { id: 'a', from: 'ASSUMPTION', to: 'GOAL', beforeId: null, dependents: 'rewrite' })).not.toHaveProperty('confirmedDependents');
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
    expect(action('reorder', { id: 'n', column: 'DERIVATION', beforeId: 'm' })).toEqual({ kind: 'reorder', id: 'n', column: 'DERIVATION', beforeId: 'm' });
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
    expect([...ACTION_MESSAGE_TYPES].sort()).toEqual(['addNode', 'createSubject', 'deleteNode', 'editNode', 'kindChange', 'reorder', 'theseSuffice']);
  });

  it('reads the request id of any message that has one', () => {
    expect(requestIdOf(message('undo', { requestId: 'u-1' }))).toBe('u-1');
    expect(requestIdOf(message('undo', {}))).toBeUndefined();
    expect(requestIdOf(message('copyText', { text: 'x' }))).toBeUndefined();
    const m = message('deleteNode', { id: 'n', keepLean: false, requestId: 'd_2' }) as ActionMessage;
    expect(requestIdOf(m)).toBe('d_2');
  });
});
