/**
 * Claude's suggested premises on the board (D-6, 03 section 7): translucent "Claude suggests" cards at the top of the
 * Assumptions column (they wait for a decision), in the proposed view only (they are part of the proposal, not of the
 * user's files). They carry no `data-node-id`: they are not cards of the model, and arrows never attach to them.
 */
import { useMemo } from 'react';
import { suggestedGhosts } from '../model/run';
import { GhostSuggestion } from '../run/GhostSuggestion';
import { useBoard } from '../state/context';
import { proposedOverlay } from '../state/store';

export function GhostCards() {
  const proposed = useBoard((s) => proposedOverlay(s) !== null);
  const run = useBoard((s) => s.run);
  const proposal = useBoard((s) => s.proposal);
  const ghosts = useMemo(() => (proposed ? suggestedGhosts(run, proposal) : []), [proposed, run, proposal]);
  if (ghosts.length === 0) return null;
  return (
    <>
      {ghosts.map((ghost) => (
        <GhostSuggestion key={ghost.id} ghost={ghost} variant="board" />
      ))}
    </>
  );
}
