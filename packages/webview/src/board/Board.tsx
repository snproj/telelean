import { monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/adapter/element-adapter';
import { autoScrollForElements } from '@atlaskit/pragmatic-drag-and-drop-auto-scroll/element';
import { NODE_TYPES, type NodeType } from '@telelean/core';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useBoard, useBoardStore } from '../state/context';
import { boardView, proposedOverlay, type BoardState, type BoardStore } from '../state/store';
import { Column, type ColumnRefs } from './Column';
import { setCurrentEngine } from './diagnostics';
import { columnOf, dropPlacement, isCardDragData } from './dnd';
import { EdgeEngine, MARKER_VARIANTS } from './EdgeEngine';
import { hasFocusEdges, toDisplayEdges } from './edges';
import type { BadgeDir } from './geometry';

/** The DOM elements of one column that the edge engine works with. */
interface ColumnElements {
  list?: HTMLDivElement;
  up?: HTMLElement;
  down?: HTMLElement;
}

type Layer = 'under' | 'over';

/**
 * Arrowheads, one per variant (MARKER_VARIANTS): filled triangles for declared / verified / focus / mismatch /
 * reference, a hollow one for conditional edges (taken as a hypothesis). Filled through CSS classes (inline style
 * attributes are blocked by the CSP).
 */
function EdgeDefs({ layer }: { layer: Layer }) {
  return (
    <defs>
      {MARKER_VARIANTS.map((variant) => (
        <marker
          key={variant}
          id={`tl-arrow-${layer}-${variant}`}
          className={`tl-marker tl-marker--${variant}`}
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerUnits="userSpaceOnUse"
          markerWidth={variant === 'reference' ? 7 : 9}
          markerHeight={variant === 'reference' ? 7 : 9}
          orient="auto-start-reverse"
        >
          {variant.startsWith('conditional') ? <path d="M1,1.5 L9,5 L1,8.5 z" /> : <path d="M0,1 L10,5 L0,9 z" />}
        </marker>
      ))}
      <clipPath id={`tl-clip-${layer}`}>
        <rect data-clip={layer} x="0" y="0" width="0" height="0" />
      </clipPath>
    </defs>
  );
}

const focusOf = (s: BoardState): ReadonlySet<string> => new Set(s.hover ? [...s.selected, s.hover] : s.selected);

/** Board-level drag monitor: highlights the column under the pointer and applies the drop. */
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
          // Dropping outside every column cancels (D-17).
          const placement = dropPlacement(location.current.dropTargets, state.order, source.data.id);
          if (placement) state.dropCard(source.data.id, placement.kind, placement.beforeId);
        },
      }),
    [store],
  );
}

/** All three columns' elements, or null while any of them is not mounted. */
function complete(columns: Partial<Record<NodeType, ColumnElements>>) {
  const lists = {} as Record<NodeType, HTMLDivElement>;
  const badgeSlots = {} as Record<NodeType, Record<BadgeDir, HTMLElement>>;
  for (const kind of NODE_TYPES) {
    const { list, up, down } = columns[kind] ?? {};
    if (!list || !up || !down) return null;
    lists[kind] = list;
    badgeSlots[kind] = { up, down };
  }
  return { lists, badgeSlots };
}

export function Board() {
  const store = useBoardStore();
  const hasGraph = useBoard((s) => s.version !== null);
  const graphSeq = useBoard((s) => s.seq);
  const dragging = useBoard((s) => s.drag !== null);
  const proposed = useBoard((s) => proposedOverlay(s) !== null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const columns = useRef<Partial<Record<NodeType, ColumnElements>>>({});
  const underRef = useRef<SVGGElement>(null);
  const overRef = useRef<SVGGElement>(null);

  const columnRefs = useMemo(() => {
    const refs = {} as Record<NodeType, ColumnRefs>;
    for (const kind of NODE_TYPES) {
      const slot = <K extends keyof ColumnElements>(key: K) => (element: ColumnElements[K] | null) => {
        const entry = (columns.current[kind] ??= {});
        if (element) entry[key] = element;
        else delete entry[key];
      };
      refs[kind] = { list: slot('list'), up: slot('up'), down: slot('down') };
    }
    return refs;
  }, []);

  useLayoutEffect(() => {
    const board = boardRef.current;
    const under = underRef.current;
    const over = overRef.current;
    const parts = complete(columns.current);
    if (!board || !under || !over || !parts) return;
    const clipRects = [...board.querySelectorAll<SVGRectElement>('rect[data-clip]')];
    const engine = new EdgeEngine({ board, lists: parts.lists, layers: { under, over }, clipRects, badgeSlots: parts.badgeSlots });
    const initial = store.getState();
    engine.setEdges(toDisplayEdges(boardView(initial).edges, focusOf(initial)));
    engine.setFocus(focusOf(initial));
    const unsubscribe = store.subscribe((state, previous) => {
      const focusChanged = state.selected !== previous.selected || state.hover !== previous.hover;
      // The arrows of the board on screen: the current graph's, or the proposal's in the proposed view (M2).
      const edges = boardView(state).edges;
      // lean-ref arrows are drawn only while one of their ends has focus, so a focus change can change the set.
      if (edges !== boardView(previous).edges || (focusChanged && hasFocusEdges(edges))) engine.setEdges(toDisplayEdges(edges, focusOf(state)));
      if (focusChanged) engine.setFocus(focusOf(state));
    });
    setCurrentEngine(engine);
    return () => {
      setCurrentEngine(null);
      unsubscribe();
      engine.dispose();
    };
  }, [store]);

  useBoardDnd(store);

  // A narrow board (e.g. a file opened beside it) keeps readable columns and scrolls sideways instead (CSS:
  // --tl-col-min); during a drag, the pointer near either side scrolls it.
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    return autoScrollForElements({ element, getAllowedAxis: () => 'horizontal' });
  }, []);

  return (
    <div className="tl-board-scroll" ref={scrollRef}>
      <div className="tl-board" ref={boardRef} data-dragging={dragging || undefined} data-graph-seq={graphSeq} data-view={proposed ? 'proposed' : 'current'}>
        <svg className="tl-edges tl-edges--under" aria-hidden="true">
          <EdgeDefs layer="under" />
          <g ref={underRef} clipPath="url(#tl-clip-under)" />
        </svg>
        <div className="tl-columns">
          {NODE_TYPES.map((kind) => (
            <Column key={kind} kind={kind} refs={columnRefs[kind]} />
          ))}
        </div>
        <svg className="tl-edges tl-edges--over" aria-hidden="true">
          <EdgeDefs layer="over" />
          <g ref={overRef} clipPath="url(#tl-clip-over)" />
        </svg>
        {hasGraph ? null : <p className="tl-board__waiting">Waiting for the extension to send the graph…</p>}
      </div>
    </div>
  );
}
