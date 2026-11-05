/**
 * Protocol messages (already validated by core's `parseWebviewToHost`) to the runner's BoardActions
 * (docs/m1-plan.md section 5.5). The board's current subject fills in what the message does not say.
 */
import type { BoardAction, WebviewToHostMessage } from '@telelean/core';

/** The webview messages that become a BoardAction (`ModelWorkspace.perform`). */
export const ACTION_MESSAGE_TYPES = ['addNode', 'kindChange', 'theseSuffice', 'editNode', 'deleteNode', 'reorder', 'createSubject'] as const;
export type ActionMessageType = (typeof ACTION_MESSAGE_TYPES)[number];
export type ActionMessage = Extract<WebviewToHostMessage, { type: ActionMessageType }>;

export function isActionMessage(message: WebviewToHostMessage): message is ActionMessage {
  return (ACTION_MESSAGE_TYPES as readonly string[]).includes(message.type);
}

/**
 * The BoardAction for an action message, or undefined when there is none: "These suffice" with no premises
 * ("Self-evident?") asks for a proof from nothing, which is a Claude run (M2: the tray posts `startRun` for it); the
 * host answers a `theseSuffice` without premises `not-yet`.
 * `addNode.clientId` is the webview's provisional id and never becomes the node's id (the host derives ids, 6.2).
 */
export function toBoardAction(message: ActionMessage, subject: string): BoardAction | undefined {
  switch (message.type) {
    case 'addNode': {
      const { type, naturalName, rationale, stance, source } = message.payload;
      return {
        kind: 'add-node',
        subject,
        type,
        naturalName,
        ...(rationale !== undefined ? { rationale } : {}),
        ...(stance !== undefined ? { stance } : {}),
        ...(source !== undefined ? { source } : {}),
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
  }
}

/** The request id a message carries, if its type has one. */
export function requestIdOf(message: WebviewToHostMessage): string | undefined {
  const payload = message.payload as { requestId?: unknown };
  return typeof payload.requestId === 'string' ? payload.requestId : undefined;
}

/** Shown when a `theseSuffice` without premises arrives (the M2 tray starts a Claude run for "Self-evident?" instead). */
export const SELF_EVIDENT_NOT_YET =
  '"Self-evident?" (a proof from no premises) is a Claude run: start it from the tray\'s "Self-evident?" button. To declare premises, select the ones that suffice.';
