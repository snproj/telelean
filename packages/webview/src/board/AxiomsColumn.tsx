/**
 * The AXIOMS column (spec v4 BD-1, BD-2; slice 1c): the axiom cards in the user's order, scrolling on its own, left of
 * the PROPOSITIONS canvas. Re-order by dragging within the column (pragmatic-drag-and-drop) or Alt+↑/↓. Its header
 * counts the axioms and, on a second line, what is assumed outside the column (pending claims, existence and hidden
 * assumptions), each linked to its card or Vocabulary item. In the Proposed view, Claude's suggested premises ("Claude
 * suggests") wait at the top of the column. The edge engine owns the "▲ / ▼ n linked" buttons in the header and footer.
 *
 * Spec v4 AR-7 (slice 1c2): while a proposition moved on the canvas is over the column (the store's `overAxioms`), the
 * column is the active drop zone and states what the drop does ("Drop to move to axioms", with kindChangeImpact's
 * impact); a release there runs "Move to axioms" (BoardInput). Several moved cards are refused: one at a time.
 */
import { dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/adapter/element-adapter';
import { combine } from '@atlaskit/pragmatic-drag-and-drop/utils/combine';
import { autoScrollForElements } from '@atlaskit/pragmatic-drag-and-drop-auto-scroll/element';
import { useCallback, useEffect, useRef } from 'react';
import { COLUMN_TITLE, KIND_GLYPH } from '../labels';
import { useBoard, useBoardStore } from '../state/context';
import { boardView, editLock } from '../state/store';
import { AlsoAssumedLine } from './AlsoAssumed';
import { columnTargetData, isCardDragData } from './dnd';
import { DropZone } from './DropZone';
import { columnDropCue, SEVERAL_TO_AXIOMS } from './gestures';
import { GhostCards } from './GhostCards';
import { NodeCard } from './NodeCard';

/** Elements the board needs from the column: the section (pointer handling), the scrolling list and the badge slots. */
export interface AxiomsColumnRefs {
  section: (element: HTMLElement | null) => void;
  list: (element: HTMLDivElement | null) => void;
  /** In the header: the engine puts "▲ n linked" here. */
  up: (element: HTMLSpanElement | null) => void;
  /** In the footer: the engine puts "▼ n linked" here. */
  down: (element: HTMLSpanElement | null) => void;
}

const KIND = 'AXIOM';

export function AxiomsColumn({ refs }: { refs: AxiomsColumnRefs }) {
  const ids = useBoard((s) => boardView(s).order.AXIOM);
  const dragFrom = useBoard((s) => s.drag?.from ?? null);
  const dragId = useBoard((s) => s.drag?.id ?? null);
  const active = useBoard((s) => s.dropKind === KIND);
  /** Slice 1c2: propositions moved on the canvas are over the column. */
  const moved = useBoard((s) => s.overAxioms);
  /** A board without any card: the column points to the A|P box below. */
  const firstStep = useBoard((s) => s.version !== null && Object.keys(boardView(s).nodes).length === 0);
  const list = useRef<HTMLDivElement | null>(null);
  const store = useBoardStore();

  useEffect(() => {
    const element = list.current;
    if (!element) return;
    return combine(
      // Slice 1f (ES-9): no drop lands while an edit session (a run) is active.
      dropTargetForElements({ element, getData: () => columnTargetData(KIND), canDrop: ({ source }) => isCardDragData(source.data) && editLock(store.getState()) === null }),
      autoScrollForElements({ element, getAllowedAxis: () => 'vertical' }),
    );
  }, [store]);

  const setList = useCallback(
    (element: HTMLDivElement | null) => {
      list.current = element;
      refs.list(element);
    },
    [refs],
  );

  // During a drag: the column under the pointer is "active"; a drag from elsewhere makes it a labelled drop zone (D-17).
  // A move from the canvas (slice 1c2) makes it the zone only while the pointer is over it; several moved cards are
  // refused there, so the column shows the refusal, never the accepting cue (slice 1d carry-over).
  const drop = columnDropCue({ moved, dragFrom, active, kind: KIND });
  const changesKind = moved !== null || (drop !== undefined && dragFrom !== KIND);
  const several = moved !== null && moved.count > 1;
  const zoneId = moved?.id ?? dragId;
  const empty = ids.length === 0;

  return (
    <section ref={refs.section} className="tl-col tl-axioms" data-kind={KIND} data-drop={drop} aria-labelledby="tl-col-title-AXIOM">
      <header className="tl-col__header">
        <span className="tl-glyph" data-kind={KIND} aria-hidden="true">
          {KIND_GLYPH[KIND]}
        </span>
        <h2 className="tl-col__title" id="tl-col-title-AXIOM">
          {COLUMN_TITLE[KIND]}
        </h2>
        <span className="tl-col__count">{ids.length}</span>
        {changesKind ? <span className="tl-col__drop-label">{several ? SEVERAL_TO_AXIOMS.label : 'Drop to move to axioms'}</span> : null}
        {/* Filled by the edge engine; React never renders children here. */}
        <span ref={refs.up} className="tl-col__badge-slot" data-dir="up" />
      </header>
      <AlsoAssumedLine />
      <div ref={setList} className="tl-col__list" data-kind={KIND} data-empty={empty || undefined} role="list" aria-label={COLUMN_TITLE[KIND]}>
        {/* M2: Claude's suggested premises, translucent, first in the column: they wait for a decision (proposed view only). */}
        <GhostCards />
        {ids.map((id) => (
          <NodeCard key={id} id={id} place="column" />
        ))}
        {empty ? (
          <p className="tl-col__empty">
            No axioms yet{firstStep ? <span className="tl-col__first-step">: type your first one in the box below</span> : null}
          </p>
        ) : null}
      </div>
      {changesKind && zoneId !== null ? <DropZone kind={KIND} id={zoneId} active={moved !== null || active} several={several} /> : null}
      <footer className="tl-col__footer">
        <span ref={refs.down} className="tl-col__badge-slot" data-dir="down" />
      </footer>
    </section>
  );
}
