/**
 * Claude's suggested premises on the board (D-6, 03 section 7). Slice 2h (§5.10, D2-35): an edit session's Add premise
 * drafts not written yet (`SessionView.board.premises`, only while the results are shown): translucent "Claude
 * suggests" cards at the top of the AXIOMS column, in the Proposed view only, each with a "+" arrow into its target
 * (the edge engine measures the card as an arrow end, `data-edge-anchor`) and a "Review it" button. They are decided
 * only in the list (M2's "I hold this" / "No" are retired with its review). They carry no `data-node-id`: they are not
 * cards of the model.
 */
import { REVIEW_TEXTS } from '@telelean/core';
import { AgentText, UserText } from '../common/AgentText';
import { markText, premiseAnchor } from '../model/sessionBoard';
import { useBoard, useBoardActions } from '../state/context';
import { proposedOverlay } from '../state/store';

export function GhostCards() {
  const premises = useBoard((s) => proposedOverlay(s)?.premises ?? null);
  const nodes = useBoard((s) => proposedOverlay(s)?.nodes ?? null);
  const actions = useBoardActions();
  if (premises === null || premises.length === 0) return null;
  return (
    <>
      {premises.map((p) => (
        <div key={p.item} className="tl-ghost" data-testid="ghost-card" data-ghost-id={p.item} data-edge-anchor={premiseAnchor(p.item)} data-status={p.status} role="note">
          <div className="tl-ghost__marker">
            <span className="codicon codicon-sparkle" aria-hidden="true" /> {REVIEW_TEXTS.claudeSuggests}
          </div>
          <span className="tl-ghost__status" data-testid="ghost-status">
            {markText({ kind: 'add-premise', status: p.status })}
          </span>
          <p className="tl-ghost__sentence">
            <AgentText text={p.sentence} />
          </p>
          <p className="tl-ghost__why">
            {'+ → '}
            {nodes?.[p.target]?.provenance.wordedBy === 'agent' ? <AgentText text={nodes[p.target]?.naturalName ?? p.target} /> : <UserText text={nodes?.[p.target]?.naturalName ?? p.target} />}
          </p>
          <div className="tl-ghost__buttons">
            <button type="button" className="tl-button tl-button--small tl-button--secondary" data-testid="ghost-review" onClick={() => actions.focusItem(p.item)}>
              {REVIEW_TEXTS.reviewIt}
            </button>
          </div>
        </div>
      ))}
    </>
  );
}
