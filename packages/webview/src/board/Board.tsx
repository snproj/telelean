/**
 * The board (spec v4 BD-1, slice 1c): the Vocabulary and Definitions columns above, then the AXIOMS column on the
 * left and the PROPOSITIONS canvas filling the rest, with one arrow overlay under both (the EdgeEngine), the canvas's
 * view (CanvasView), the pointer, wheel and keyboard handling (BoardInput) and the right-click menu (ContextMenu).
 * Slice 1c2: a second, empty overlay above both parts (`svg.tl-draft`, never taking the pointer) holds what a gesture
 * draws while it lasts: the rubber-band arrow from a card's handle and the selection rectangle; the draw hint next to
 * the pointer says where the arrow would land (AR-6: the impact before you let go).
 * Slice 1d (BD-5, BD-7): the arrows' tooltips know the cards' proofs (TL109's "not used by the current proof"), and each
 * checked proposition's band (board/band.ts) is drawn by the engine in its own group, above the arrows it binds.
 */
import { monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/adapter/element-adapter';
import type { ArrowEnds } from '@telelean/core';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useBoard, useBoardStore } from '../state/context';
import { boardView, proposedOverlay, type BoardState, type BoardStore } from '../state/store';
import { AxiomsColumn, type AxiomsColumnRefs } from './AxiomsColumn';
import { bandsOf } from './band';
import { attachBoardInput, type MenuRequest } from './BoardInput';
import { CanvasView, setCurrentCanvas } from './canvas/CanvasView';
import { ContextMenu } from './ContextMenu';
import { setCurrentEngine } from './diagnostics';
import { columnOf, dropPlacement, isCardDragData } from './dnd';
import { EdgeEngine, MARKER_VARIANTS } from './EdgeEngine';
import { hasFocusEdges, toDisplayEdges, type DisplayContext } from './edges';
import { CANVAS_SIDES, type CanvasSide } from './geometry';
import { PropositionCanvas, type CanvasRefs } from './PropositionCanvas';
import { VocabularyBand } from './Vocabulary';

/**
 * Arrowheads, one per variant (MARKER_VARIANTS): filled triangles for declared / verified / focus / reference, a
 * notched one for a mismatch (TL107, slice 1d; also when focused), a hollow one for conditional edges (taken as a
 * hypothesis). Filled through CSS classes (inline style attributes are blocked by the CSP). Two clip paths: the canvas,
 * and the board (the column's visible band, the canvas, and the strip between them); the engine sizes their rectangles.
 */
function EdgeDefs() {
  return (
    <defs>
      {MARKER_VARIANTS.map((variant) => (
        <marker
          key={variant}
          id={`tl-arrow-${variant}`}
          className={`tl-marker tl-marker--${variant}`}
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerUnits="userSpaceOnUse"
          markerWidth={variant === 'reference' ? 7 : 9}
          markerHeight={variant === 'reference' ? 7 : 9}
          orient="auto-start-reverse"
        >
          {variant.startsWith('conditional') ? (
            <path d="M1,1.5 L9,5 L1,8.5 z" />
          ) : variant.startsWith('mismatch') ? (
            // Slice 1d (BD-5, never colour alone): a proof's use nobody drew (TL107) has a notched head as well as its
            // colour, kept in the focus colour while it is focused or selected (1d fixer).
            <path d="M0,1 L10,5 L0,9 L3.5,5 z" />
          ) : (
            <path d="M0,1 L10,5 L0,9 z" />
          )}
        </marker>
      ))}
      <clipPath id="tl-clip-board">
        <rect data-clip="column" x="0" y="0" width="0" height="0" />
        <rect data-clip="gap" x="0" y="0" width="0" height="0" />
        <rect data-clip="canvas" x="0" y="0" width="0" height="0" />
      </clipPath>
      <clipPath id="tl-clip-canvas">
        <rect data-clip="canvas" x="0" y="0" width="0" height="0" />
      </clipPath>
    </defs>
  );
}

const focusOf = (s: BoardState): ReadonlySet<string> => new Set(s.hover ? [...s.selected, s.hover] : s.selected);
const selectedEdgesOf = (arrows: readonly ArrowEnds[]): ReadonlySet<string> => new Set(arrows.map((a) => `${a.source}->${a.target}`));
/** AR-5: the cards whose "follows from nothing" mark is drawn (propositions only; the board view's cards). */
const marksOf = (s: BoardState): string[] => {
  const nodes = boardView(s).nodes;
  return boardView(s).order.PROPOSITION.filter((id) => nodes[id]?.fromNothing === true);
};
/** Slice 1d: what the arrows' tooltips may say about proofs (nothing for a result the Proposed view still hides). */
const displayContextOf = (s: BoardState): DisplayContext => {
  const hidden = proposedOverlay(s)?.hidden;
  return { nodes: boardView(s).nodes, ...(hidden ? { hidden } : {}) };
};
/** Slice 1d (BD-7): the bands of the board on screen (none for a result the Proposed view still hides). */
const bandsOfState = (s: BoardState) => {
  const view = boardView(s);
  const hidden = proposedOverlay(s)?.hidden;
  return bandsOf({ nodes: view.nodes, edges: view.edges, vocab: view.vocab, ...(hidden ? { hidden } : {}) });
};

/** Board-level drag monitor (the AXIOMS column's re-order, D-17): highlights the part under the pointer, applies the drop. */
function useBoardDnd(store: BoardStore) {
  useEffect(
    () =>
      monitorForElements({
        canMonitor: ({ source }) => isCardDragData(source.data),
        onDragStart: ({ source }) => {
          if (isCardDragData(source.data)) store.getState().startDrag(source.data.id);
        },
        onDropTargetChange: ({ location }) => store.getState().setDropKind(columnOf(location.current.dropTargets)),
        onDrop: ({ source, location }) => {
          const state = store.getState();
          state.endDrag();
          if (!isCardDragData(source.data)) return;
          // Dropping outside the column and the canvas cancels (D-17).
          const placement = dropPlacement(location.current.dropTargets, state.order, source.data.id);
          if (placement) state.dropCard(source.data.id, placement.kind, placement.beforeId);
        },
      }),
    [store],
  );
}

interface Parts {
  section?: HTMLElement;
  list?: HTMLDivElement;
  up?: HTMLSpanElement;
  down?: HTMLSpanElement;
  viewport?: HTMLDivElement;
  layer?: HTMLDivElement;
  slots: Partial<Record<CanvasSide, HTMLSpanElement>>;
}

export function Board() {
  const store = useBoardStore();
  const hasGraph = useBoard((s) => s.version !== null);
  const graphSeq = useBoard((s) => s.seq);
  const dragging = useBoard((s) => s.drag !== null);
  const proposed = useBoard((s) => proposedOverlay(s) !== null);
  const canvas = useMemo(() => new CanvasView(), []);
  const [menu, setMenu] = useState<MenuRequest | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const boardGroup = useRef<SVGGElement>(null);
  const canvasGroup = useRef<SVGGElement>(null);
  const marksGroup = useRef<SVGGElement>(null);
  const bandsGroup = useRef<SVGGElement>(null);
  const draftSvg = useRef<SVGSVGElement>(null);
  const draftArea = useRef<SVGRectElement>(null);
  const draftArrow = useRef<SVGPathElement>(null);
  const drawHint = useRef<HTMLDivElement>(null);
  const parts = useRef<Parts>({ slots: {} });

  const columnRefs = useMemo<AxiomsColumnRefs>(() => {
    const slot = <K extends 'section' | 'list' | 'up' | 'down'>(key: K) => (element: Parts[K] | null) => {
      if (element) parts.current[key] = element;
      else delete parts.current[key];
    };
    return { section: slot('section'), list: slot('list'), up: slot('up'), down: slot('down') };
  }, []);

  const canvasRefs = useMemo<CanvasRefs>(() => {
    const slots = {} as Record<CanvasSide, (element: HTMLSpanElement | null) => void>;
    for (const side of CANVAS_SIDES) {
      slots[side] = (element) => {
        if (element) parts.current.slots[side] = element;
        else delete parts.current.slots[side];
      };
    }
    return {
      viewport: (element) => {
        if (element) parts.current.viewport = element;
        else delete parts.current.viewport;
      },
      layer: (element) => {
        if (element) parts.current.layer = element;
        else delete parts.current.layer;
      },
      slots,
    };
  }, []);

  useLayoutEffect(() => {
    const board = boardRef.current;
    const svg = svgRef.current;
    const groups = { board: boardGroup.current, canvas: canvasGroup.current, marks: marksGroup.current, bands: bandsGroup.current };
    const { section, list, up, down, viewport, layer, slots } = parts.current;
    const draft = { svg: draftSvg.current, area: draftArea.current, arrow: draftArrow.current, hint: drawHint.current };
    if (!board || !svg || !groups.board || !groups.canvas || !groups.marks || !groups.bands || !section || !list || !up || !down || !viewport || !layer) return;
    if (!CANVAS_SIDES.every((side) => slots[side])) return;
    if (!draft.svg || !draft.area || !draft.arrow || !draft.hint) return;
    const engine = new EdgeEngine({
      board,
      column: { list, up, down },
      canvas: { viewport, layer, view: canvas, slots: slots as Record<CanvasSide, HTMLElement> },
      svg,
      groups: { board: groups.board, canvas: groups.canvas, marks: groups.marks, bands: groups.bands },
    });
    const initial = store.getState();
    engine.setEdges(toDisplayEdges(boardView(initial).edges, focusOf(initial), displayContextOf(initial)));
    engine.setFocus(focusOf(initial));
    engine.setSelection(selectedEdgesOf(initial.selectedArrows), new Set(initial.selectedMarks));
    engine.setMarks(marksOf(initial));
    engine.setBands(bandsOfState(initial));
    const unsubscribe = store.subscribe((state, previous) => {
      const focusChanged = state.selected !== previous.selected || state.hover !== previous.hover;
      // The arrows of the board on screen: the current graph's, or the proposal's in the proposed view (M2).
      const view = boardView(state);
      const before = boardView(previous);
      const edges = view.edges;
      // Slice 1d: the tooltips and the bands depend on the cards' proofs and on which results the overlay hides.
      const hiddenChanged = proposedOverlay(state)?.hidden !== proposedOverlay(previous)?.hidden;
      const proofsChanged = view.nodes !== before.nodes || hiddenChanged;
      // lean-ref arrows are drawn only while one of their ends has focus, so a focus change can change the set.
      if (edges !== before.edges || proofsChanged || (focusChanged && hasFocusEdges(edges))) engine.setEdges(toDisplayEdges(edges, focusOf(state), displayContextOf(state)));
      if (focusChanged) engine.setFocus(focusOf(state));
      if (state.selectedArrows !== previous.selectedArrows || state.selectedMarks !== previous.selectedMarks) {
        engine.setSelection(selectedEdgesOf(state.selectedArrows), new Set(state.selectedMarks));
      }
      if (view.nodes !== before.nodes || view.order !== before.order) engine.setMarks(marksOf(state));
      if (edges !== before.edges || proofsChanged || view.vocab !== before.vocab) engine.setBands(bandsOfState(state));
    });
    setCurrentEngine(engine);
    setCurrentCanvas(canvas);
    const detach = attachBoardInput({
      board,
      column: section,
      list,
      viewport,
      canvas,
      store,
      engine,
      openMenu: setMenu,
      draft: { svg: draft.svg, area: draft.area, arrow: draft.arrow, hint: draft.hint },
    });
    return () => {
      detach();
      setCurrentCanvas(null);
      setCurrentEngine(null);
      unsubscribe();
      engine.dispose();
    };
  }, [store, canvas]);

  useBoardDnd(store);

  return (
    <div className="tl-board-area">
      <VocabularyBand />
      <div ref={boardRef} className="tl-board" data-dragging={dragging || undefined} data-graph-seq={graphSeq} data-view={proposed ? 'proposed' : 'current'}>
        <svg ref={svgRef} className="tl-edges" aria-hidden="true">
          <EdgeDefs />
          <g ref={boardGroup} clipPath="url(#tl-clip-board)" />
          <g ref={canvasGroup} clipPath="url(#tl-clip-canvas)" />
          <g ref={marksGroup} clipPath="url(#tl-clip-canvas)" />
          {/* Slice 1d (BD-7): the bands, above the arrows and stubs they bind, clipped like them. */}
          <g ref={bandsGroup} clipPath="url(#tl-clip-canvas)" />
        </svg>
        <AxiomsColumn refs={columnRefs} />
        <PropositionCanvas canvas={canvas} refs={canvasRefs} />
        {/* Slice 1c2: what a gesture draws while it lasts (BoardInput fills it); never takes the pointer. */}
        <svg ref={draftSvg} className="tl-draft" aria-hidden="true">
          <rect ref={draftArea} className="tl-draft__area" x="0" y="0" width="0" height="0" />
          <path ref={draftArrow} className="tl-draft__arrow" d="M0 0" markerEnd="url(#tl-arrow-focus)" />
        </svg>
        <div ref={drawHint} className="tl-draw-hint" data-testid="draw-hint" hidden />
        {hasGraph ? null : <p className="tl-board__waiting">Waiting for the extension to send the graph…</p>}
      </div>
      <ContextMenu menu={menu} onClose={() => setMenu(null)} canvas={canvas} />
    </div>
  );
}
