/**
 * Slice 1e: Formalize for dependencies on the current selection (board/contextActions.ts `formalizeState`) for a
 * component: the Context Menu section and the right-click menu. `useBoard` needs stable values, so the state is built
 * here from the store's slices (each stable) and memoised. Slice 2h (§5.11): on the board on screen (a session's
 * Proposed view included), with the root's edit session.
 */
import { useMemo } from 'react';
import { useBoard } from '../state/context';
import { boardView, formalizeRunBlockOf, proposedOverlay } from '../state/store';
import { formalizeState, type FormalizeState } from './contextActions';

export function useFormalize(): FormalizeState {
  const nodes = useBoard((s) => boardView(s).nodes);
  const edges = useBoard((s) => boardView(s).edges);
  const selectedArrows = useBoard((s) => s.selectedArrows);
  const selectedMarks = useBoard((s) => s.selectedMarks);
  const provisional = useBoard((s) => s.provisional);
  const runBlock = useBoard(formalizeRunBlockOf);
  const subject = useBoard((s) => s.subject);
  const session = useBoard((s) => s.session);
  const proposed = useBoard((s) => proposedOverlay(s) !== null);
  return useMemo(
    () =>
      formalizeState({
        nodes,
        edges,
        selectedArrows,
        selectedMarks,
        provisional,
        runBlock,
        subject,
        ...(session !== null ? { session: { view: session, proposed } } : {}),
      }),
    [nodes, edges, selectedArrows, selectedMarks, provisional, runBlock, subject, session, proposed],
  );
}
