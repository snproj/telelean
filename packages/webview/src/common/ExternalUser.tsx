/**
 * A user of a card's Lean that is not a card of this board (M2 carry-over 1, `LeanBinding.externalUsers`): another
 * subject's card by its sentence with "(subject …)", a declaration without a card (a lemma) by its Lean name in code
 * font. Used by the expanded card's "Used by" and by the delete dialog.
 */
import type { ExternalUser } from '@telelean/core';

/** How the declaration uses the card. */
export const EXTERNAL_USE_TEXT: Readonly<Record<ExternalUser['where'], string>> = {
  proof: 'uses it in a proof',
  statement: 'mentions it in its statement',
};

export function ExternalUserItem({ user }: { user: ExternalUser }) {
  return (
    <>
      {user.naturalName ? (
        <span className="tl-ext-user" data-ext-user={user.name}>
          <span className="tl-ext-user__text">{user.naturalName}</span> <span className="tl-dialog__from">(subject {user.subject ?? '?'})</span>
        </span>
      ) : (
        <span className="tl-ext-user" data-ext-user={user.name}>
          <code>{user.name}</code>
        </span>
      )}
      <span className="tl-rel__why">{EXTERNAL_USE_TEXT[user.where]}</span>
    </>
  );
}
