/**
 * The labelled drop zone of a part of the board during a drag that would change a card's kind (D-17): what the drop
 * would do, from kindChangeImpact (D-11), e.g. "Move to axioms: its proof becomes an axiom". It lets the pointer
 * through, so the drop still lands on the card or list underneath. An axiom dragged to the propositions is refused
 * (spec v4 AR-6): the zone says how to make it a proposition instead. Slice 1c: the canvas shows the refusal while an
 * axiom of the column is dragged over it. Slice 1c2 (AR-7): the AXIOMS column shows its zone while a proposition moved
 * on the canvas is over it (`id`: the card the drop is about); several moved cards are refused (`several`), since the
 * column takes one card at a time.
 */
import { AXIOM_DROP_REFUSAL, AXIOM_TO_PROPOSITION_REFUSAL, type NodeType } from '@telelean/core';
import { plainText } from '../model/format';
import { useBoard } from '../state/context';
import { impactOf, kindChangeRefused } from '../state/store';
import { SEVERAL_TO_AXIOMS } from './gestures';

export function DropZone({ kind, id, active, several = false }: { kind: NodeType; id: string; active: boolean; several?: boolean }) {
  const refused = useBoard((s) => kindChangeRefused(s, id, kind));
  const summary = useBoard((s) => impactOf(s, id, kind)?.summary ?? null);
  const detail = useBoard((s) => impactOf(s, id, kind)?.detail ?? null);
  const confirm = useBoard((s) => impactOf(s, id, kind)?.needsConfirmation === true);
  if (several || refused) {
    return (
      <div className="tl-dropzone" data-testid="dropzone" data-kind={kind} data-refused="true" data-active={active || undefined} aria-hidden="true">
        <span className="tl-dropzone__summary">{several ? SEVERAL_TO_AXIOMS.summary : AXIOM_DROP_REFUSAL}</span>
        <span className="tl-dropzone__detail">{several ? SEVERAL_TO_AXIOMS.detail : AXIOM_TO_PROPOSITION_REFUSAL}</span>
      </div>
    );
  }
  if (!summary) return null;
  return (
    <div className="tl-dropzone" data-testid="dropzone" data-kind={kind} data-active={active || undefined} data-confirm={confirm || undefined} aria-hidden="true">
      <span className="tl-dropzone__summary">{summary}</span>
      {detail ? <span className="tl-dropzone__detail">{plainText(detail)}</span> : null}
    </div>
  );
}
