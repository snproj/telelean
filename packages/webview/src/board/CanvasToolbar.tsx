/**
 * The canvas's toolbar (spec v4 BD-3, slice 1c), in its top-right corner: zoom out, the zoom level, zoom in, Fit all,
 * Zoom to selection and Tidy layout. Tidy layout re-places the selected cards (all, when none is selected) and stores
 * their positions, one Undo step; it is an edit, so it is disabled while an edit session is active (ES-9) and in the
 * Proposed view, with the reason. The view changes always work.
 */
import { useCallback, useSyncExternalStore } from 'react';
import { useBoard, useBoardStore } from '../state/context';
import { boardView, editLock, proposedOverlay } from '../state/store';
import type { CanvasView } from './canvas/CanvasView';
import { MENU_PROPOSED_READ_ONLY } from './menu';

/** The propositions among the selected cards (the ones Tidy layout and Zoom to selection act on). */
export function selectedOnCanvas(state: Parameters<typeof boardView>[0] & { selected: readonly string[] }): string[] {
  const nodes = boardView(state).nodes;
  return state.selected.filter((id) => nodes[id]?.type === 'PROPOSITION');
}

/** Tidy layout: the new positions of the selected propositions (all, when none is selected), stored as one move. */
export function tidyLayout(canvas: CanvasView, store: ReturnType<typeof useBoardStore>): boolean {
  const state = store.getState();
  const which = selectedOnCanvas(state);
  const positions = canvas.tidyPositions(which.length > 0 ? which : null);
  if (Object.keys(positions).length === 0) return false;
  state.moveCards(positions);
  return true;
}

export function CanvasToolbar({ canvas }: { canvas: CanvasView }) {
  const subscribe = useCallback((listener: () => void) => canvas.onChange(listener), [canvas]);
  const scale = useSyncExternalStore(subscribe, () => canvas.transform.s);
  const lock = useBoard((s) => editLock(s));
  const proposed = useBoard((s) => proposedOverlay(s) !== null);
  const selected = useBoard((s) => selectedOnCanvas(s).length);
  const hasCards = useBoard((s) => boardView(s).order.PROPOSITION.length > 0);
  const store = useBoardStore();
  const tidyReason = proposed ? MENU_PROPOSED_READ_ONLY : lock;
  const small = 'tl-button tl-button--secondary tl-button--small';

  return (
    <div className="tl-canvas__tools" role="toolbar" aria-label="Canvas" data-testid="canvas-tools">
      <button type="button" className="tl-icon-button tl-icon-button--toolbar" aria-label="Zoom out" title="Zoom out (−)" data-testid="zoom-out" onClick={() => canvas.zoomStep(-1)}>
        <span className="codicon codicon-zoom-out" aria-hidden="true" />
      </button>
      <span className="tl-canvas__zoom" data-testid="zoom-level" title="Zoom: the mouse wheel zooms about the cursor; right-drag pans">
        {Math.round(scale * 100)}%
      </span>
      <button type="button" className="tl-icon-button tl-icon-button--toolbar" aria-label="Zoom in" title="Zoom in (+)" data-testid="zoom-in" onClick={() => canvas.zoomStep(1)}>
        <span className="codicon codicon-zoom-in" aria-hidden="true" />
      </button>
      <button type="button" className={small} data-testid="fit-all" disabled={!hasCards} title="Show every proposition (0)" onClick={() => canvas.fitAll()}>
        Fit all
      </button>
      <button
        type="button"
        className={small}
        data-testid="zoom-selection"
        disabled={selected === 0}
        title={selected === 0 ? 'Select propositions on the canvas to zoom to them' : `Show the ${selected === 1 ? 'selected card' : `${selected} selected cards`}`}
        onClick={() => canvas.fitCards(store.getState().selected)}
      >
        Zoom to selection
      </button>
      <button
        type="button"
        className={small}
        data-testid="tidy-layout"
        disabled={tidyReason !== null || !hasCards}
        title={
          tidyReason ??
          (selected > 0
            ? `Place the ${selected === 1 ? 'selected card' : `${selected} selected cards`} again, sources left of their targets, and keep them there (one Undo step)`
            : 'Place every proposition again, sources left of their targets, and keep them there (one Undo step)')
        }
        onClick={() => tidyLayout(canvas, store)}
      >
        Tidy layout
      </button>
    </div>
  );
}
