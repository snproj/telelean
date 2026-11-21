/**
 * Slice 1e: Formalize for dependencies on the current selection (board/contextActions.ts `formalizeState`) for a
 * component: the Context Menu section and the right-click menu. `useBoard` needs stable values, so the state is built
 * here from the store's slices (each stable) and memoised.
 */
import { useMemo } from 'react';
import { useBoard } from '../state/context';
import { formalizeRunBlockOf } from '../state/store';
import { formalizeState, type FormalizeState } from './contextActions';

export function useFormalize(): FormalizeState {
  const nodes = useBoard((s) => s.nodes);
  const edges = useBoard((s) => s.edges);
  const selectedArrows = useBoard((s) => s.selectedArrows);
  const selectedMarks = useBoard((s) => s.selectedMarks);
  const provisional = useBoard((s) => s.provisional);
  const runBlock = useBoard(formalizeRunBlockOf);
  return useMemo(
    () => formalizeState({ nodes, edges, selectedArrows, selectedMarks, provisional, runBlock }),
    [nodes, edges, selectedArrows, selectedMarks, provisional, runBlock],
  );
}
