/**
 * Protocol messages (already validated by core's `parseWebviewToHost`) to the runner's BoardActions
 * (docs/m1-plan.md section 5.5). The board's current subject fills in what the message does not say.
 */
import type { BoardAction, WebviewToHostMessage } from '@telelean/core';

/**
 * The webview messages that become a BoardAction (`ModelWorkspace.perform`). Spec v4 slice 1b adds the arrows:
 * `addArrows`, `removeArrows`, `setFromNothing`, `claimPending` and `moveCards` (planned in core, applied, recorded and
 * undone by the runner's workspace like every other board edit). Slice 1f: every one of them is refused while a run of
 * the model folder is active (./boardSession.ts, ES-9).
 */
export const ACTION_MESSAGE_TYPES = [
  'addNode',
  'kindChange',
  'theseSuffice',
  'editNode',
  'deleteNode',
  'reorder',
  'createSubject',
  'addArrows',
  'removeArrows',
  'setFromNothing',
  'claimPending',
  'moveCards',
] as const;
export type ActionMessageType = (typeof ACTION_MESSAGE_TYPES)[number];
export type ActionMessage = Extract<WebviewToHostMessage, { type: ActionMessageType }>;

export function isActionMessage(message: WebviewToHostMessage): message is ActionMessage {
  return (ACTION_MESSAGE_TYPES as readonly string[]).includes(message.type);
}

/**
 * The BoardAction for an action message, or undefined when there is none: an M1 `theseSuffice` with no premises asks
 * for a proof from nothing, which is a Claude run; the host answers it `not-yet`. (Spec v4.1, slice 1e: the board never
 * sends `theseSuffice` any more: arrows are drawn with `addArrows`, and a proof from nothing is Formalize for
 * dependencies on a "follows from nothing" mark, a `startRun`.)
 * `addNode.clientId` is the webview's provisional id and never becomes the node's id (the host derives ids, 6.2).
 */
export function toBoardAction(message: ActionMessage, subject: string): BoardAction | undefined {
  switch (message.type) {
    case 'addNode': {
      // Spec v4 slice 1c: `position`, a new proposition's place on the canvas (stored by the same plan).
      const { type, naturalName, rationale, stance, source, position } = message.payload;
      return {
        kind: 'add-node',
        subject,
        type,
        naturalName,
        ...(rationale !== undefined ? { rationale } : {}),
        ...(stance !== undefined ? { stance } : {}),
        ...(source !== undefined ? { source } : {}),
        ...(position !== undefined ? { position: { x: position.x, y: position.y } } : {}),
      };
    }
    case 'kindChange': {
      // `confirmedDependents` (M2 carry-over 3): the dependents the dialog listed when the user chose `dependents`;
      // core refuses with `needs-confirmation` (listing all of them) when it finds others, so the choice is never
      // applied to a dependent the user did not see.
      const { id, to, beforeId, dependents, rationale, confirmedDependents } = message.payload;
      return {
        kind: 'change-kind',
        id,
        to,
        beforeId,
        ...(dependents !== undefined ? { dependents } : {}),
        ...(confirmedDependents !== undefined ? { confirmedDependents: [...confirmedDependents] } : {}),
        ...(rationale !== undefined ? { rationale } : {}),
      };
    }
    case 'theseSuffice': {
      const { premises, target } = message.payload;
      if (premises.length === 0) return undefined;
      return { kind: 'set-premises', target, premises: [...premises] };
    }
    case 'editNode': {
      const { id, field, value } = message.payload;
      return { kind: 'edit-node', id, field, value };
    }
    case 'deleteNode': {
      // `confirmed`: the user saw the declarations that use the card's Lean code (the host's needs-confirmation list)
      // and deletes it anyway; without it core refuses such a delete.
      const { id, keepLean, confirmed } = message.payload;
      return { kind: 'delete-node', id, keepLean, ...(confirmed ? { confirmed } : {}) };
    }
    case 'reorder': {
      const { id, column, beforeId } = message.payload;
      return { kind: 'reorder', id, column, beforeId };
    }
    case 'createSubject':
      return { kind: 'create-subject', name: message.payload.name };
    // Spec v4 slice 1b. `confirmed`: the user saw the impact (an axiom becoming a proposition, A16's used arrows);
    // without it core answers needs-confirmation when there is something to confirm.
    case 'addArrows': {
      const { target, sources, confirmed } = message.payload;
      return { kind: 'add-arrows', target, sources: [...sources], ...(confirmed ? { confirmed } : {}) };
    }
    case 'removeArrows': {
      // Slice 1f (carry-over 2): `marks`, the "follows from nothing" marks the same Delete removes (one plan, one step).
      const { arrows, marks, confirmed } = message.payload;
      return {
        kind: 'remove-arrows',
        arrows: arrows.map(({ source, target }) => ({ source, target })),
        ...(marks !== undefined && marks.length > 0 ? { marks: [...marks] } : {}),
        ...(confirmed ? { confirmed } : {}),
      };
    }
    case 'setFromNothing': {
      const { id, on, confirmed } = message.payload;
      return { kind: 'set-from-nothing', id, on, ...(confirmed ? { confirmed } : {}) };
    }
    case 'claimPending':
      return { kind: 'claim-pending', id: message.payload.id };
    case 'moveCards': {
      const positions: Record<string, { x: number; y: number }> = {};
      for (const [id, { x, y }] of Object.entries(message.payload.positions)) positions[id] = { x, y };
      return { kind: 'move-cards', positions };
    }
  }
}

/** The request id a message carries, if its type has one. */
export function requestIdOf(message: WebviewToHostMessage): string | undefined {
  const payload = message.payload as { requestId?: unknown };
  return typeof payload.requestId === 'string' ? payload.requestId : undefined;
}

/** Shown when a `theseSuffice` without premises arrives (spec v4.1: a proof from nothing is Formalize for dependencies on the mark). */
export const SELF_EVIDENT_NOT_YET =
  'A proof from no premises is a Claude run: mark the card "follows from nothing", select the mark and press "Formalize for dependencies". To declare premises, draw arrows into the card.';
