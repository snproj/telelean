import { dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/adapter/element-adapter';
import { combine } from '@atlaskit/pragmatic-drag-and-drop/utils/combine';
import { autoScrollForElements } from '@atlaskit/pragmatic-drag-and-drop-auto-scroll/element';
import type { NodeType } from '@telelean/core';
import { useCallback, useEffect, useRef } from 'react';
import { COLUMN_TITLE, KIND_GLYPH, KIND_NOUN } from '../labels';
import { plainText } from '../model/format';
import { useBoard } from '../state/context';
import { boardView, impactOf } from '../state/store';
import { columnTargetData, isCardDragData } from './dnd';
import { GhostCards } from './GhostCards';
import { NodeCard } from './NodeCard';
import { VocabularyGroup } from './VocabularyGroup';

/** Elements the board's edge engine needs from a column: the scrolling list and the two "n linked" slots. */
export interface ColumnRefs {
  list: (element: HTMLDivElement | null) => void;
  /** In the header, above the list: the engine puts "▲ n linked" here. */
  up: (element: HTMLSpanElement | null) => void;
  /** In the footer, below the list: the engine puts "▼ n linked" here. */
  down: (element: HTMLSpanElement | null) => void;
}

/**
 * The labelled drop zone of a column during a drag to another column (D-17): what the drop would do, from
 * kindChangeImpact (D-11), e.g. "Make Derivation: promotion pending until proved". It lets the pointer through, so
 * the drop still lands on the card or list underneath.
 */
function DropZone({ kind, active }: { kind: NodeType; active: boolean }) {
  const summary = useBoard((s) => (s.drag ? (impactOf(s, s.drag.id, kind)?.summary ?? null) : null));
  const detail = useBoard((s) => (s.drag ? (impactOf(s, s.drag.id, kind)?.detail ?? null) : null));
  const confirm = useBoard((s) => (s.drag ? impactOf(s, s.drag.id, kind)?.needsConfirmation === true : false));
  if (!summary) return null;
  return (
    <div className="tl-dropzone" data-testid="dropzone" data-kind={kind} data-active={active || undefined} data-confirm={confirm || undefined} aria-hidden="true">
      <span className="tl-dropzone__summary">{summary}</span>
      {detail ? <span className="tl-dropzone__detail">{plainText(detail)}</span> : null}
    </div>
  );
}

export function Column({ kind, refs }: { kind: NodeType; refs: ColumnRefs }) {
  const ids = useBoard((s) => boardView(s).order[kind]);
  const dragFrom = useBoard((s) => s.drag?.from ?? null);
  const active = useBoard((s) => s.dropKind === kind);
  const hasVocabulary = useBoard((s) => kind === 'ASSUMPTION' && boardView(s).vocabulary.length > 0);
  /** A board without any card: the Assumptions column points to the A|D|G box below. */
  const firstStep = useBoard((s) => kind === 'ASSUMPTION' && s.version !== null && Object.keys(boardView(s).nodes).length === 0);
  const list = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = list.current;
    if (!element) return;
    return combine(
      dropTargetForElements({ element, getData: () => columnTargetData(kind), canDrop: ({ source }) => isCardDragData(source.data) }),
      autoScrollForElements({ element, getAllowedAxis: () => 'vertical' }),
    );
  }, [kind]);

  const setList = useCallback(
    (element: HTMLDivElement | null) => {
      list.current = element;
      refs.list(element);
    },
    [refs],
  );

  // During a drag: the column under the pointer is "active"; other columns are labelled drop zones (D-17).
  const drop = dragFrom === null ? undefined : active ? 'active' : dragFrom === kind ? 'source' : 'candidate';
  const changesKind = drop !== undefined && dragFrom !== kind;
  const empty = ids.length === 0;

  return (
    <section className="tl-col" data-kind={kind} data-drop={drop} aria-labelledby={`tl-col-title-${kind}`}>
      <header className="tl-col__header">
        <span className="tl-glyph" data-kind={kind} aria-hidden="true">
          {KIND_GLYPH[kind]}
        </span>
        <h2 className="tl-col__title" id={`tl-col-title-${kind}`}>
          {COLUMN_TITLE[kind]}
        </h2>
        <span className="tl-col__count">{ids.length}</span>
        {changesKind ? <span className="tl-col__drop-label">Drop to make {KIND_NOUN[kind]}</span> : null}
        {/* Filled by the edge engine; React never renders children here. */}
        <span ref={refs.up} className="tl-col__badge-slot" data-dir="up" />
      </header>
      <div
        ref={setList}
        className="tl-col__list"
        data-kind={kind}
        data-empty={(empty && !hasVocabulary) || undefined}
        role="list"
        aria-label={COLUMN_TITLE[kind]}
      >
        {/* M2: Claude's suggested premises, translucent, first in the column: they wait for a decision (proposed view only). */}
        {kind === 'ASSUMPTION' ? <GhostCards /> : null}
        {kind === 'ASSUMPTION' ? <VocabularyGroup /> : null}
        {ids.map((id) => (
          <NodeCard key={id} id={id} />
        ))}
        {/* Opaque, so arrows that skip this column pass underneath it, as they do under cards. */}
        {empty ? (
          <p className="tl-col__empty" data-edge-obstacle>
            No {COLUMN_TITLE[kind].toLowerCase()} yet{firstStep ? <span className="tl-col__first-step">: type your first one in the box below</span> : null}
          </p>
        ) : null}
      </div>
      {changesKind ? <DropZone kind={kind} active={active} /> : null}
      <footer className="tl-col__footer">
        <span ref={refs.down} className="tl-col__badge-slot" data-dir="down" />
      </footer>
    </section>
  );
}
