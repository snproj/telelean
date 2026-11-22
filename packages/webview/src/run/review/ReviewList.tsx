/**
 * Slice 2g (docs/slice2-plan.md 5.5): the review list and its detail. The header: the counts, "Only in review",
 * "Select all in review", the group buttons "Accept N" (previewing `planGroupAccept`: "Accept k of N") and "Decline…"
 * (both send one `decideItems` with `own: false`, D2-32), and the note a group decision left. The rows: a checkbox, the
 * status as glyph and word, the label with the cards' sentences in their author's style, the badges and markers, a
 * spinner while a decision is on its way. A listbox (`aria-multiselectable`, one group per card,
 * `aria-activedescendant` for `current`) that takes the review keys (D2-37). From 640 px the list and the detail sit
 * side by side; below, the detail replaces the list.
 */
import { REVIEW_TEXTS, type ItemView, type SessionView } from '@telelean/core';
import { useLayoutEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { isTextEntry } from '../../model/format';
import { countsText, groupDeclineEntries, listControls, paneModeFor, readOnlyReason, reviewRows, rowIds, type ReviewGroup } from '../../model/review';
import { useBoard, useBoardActions } from '../../state/context';
import { DeclineMenu } from './DeclineMenu';
import { ItemDetail } from './ItemDetail';
import { Badges, Label, Marked, Spinner, StatusMark, usePhrases } from './parts';

const rowDomId = (id: string) => `tl-review-row-${id}`;

/** Builder 2g: an empty list in a stage (a queue that proposed nothing). */
export const NOTHING_TO_REVIEW = 'Nothing to review.';

/** The panel's width, measured (the CSSOM-free way: a ResizeObserver on the area). */
function useWidth(): [RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    setWidth(element.getBoundingClientRect().width);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) setWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

function Header({ session, selected }: { session: SessionView; selected: readonly string[] }) {
  const filter = useBoard((s) => s.sessionReview?.filter ?? 'all');
  const lastGroup = useBoard((s) => s.sessionReview?.lastGroup ?? null);
  const busy = useBoard((s) => s.sessionBusy !== null);
  const menu = useBoard((s) => (s.declineMenu?.origin === 'group' ? s.declineMenu : null));
  const actions = useBoardActions();
  const controls = listControls(session, selected, busy);
  const phrases = usePhrases(session);
  return (
    <div className="tl-review-list__head" data-testid="review-list-head">
      <p className="tl-review-list__counts" data-testid="review-counts">
        {countsText(session.counts)}
      </p>
      <div className="tl-review-list__tools">
        <label className="tl-check">
          <input type="checkbox" data-testid="review-filter" checked={filter === 'in-review'} onChange={(e) => actions.setReviewFilter(e.target.checked ? 'in-review' : 'all')} />
          {REVIEW_TEXTS.onlyInReview}
        </label>
        <button type="button" className="tl-link" data-testid="review-select-all" onClick={() => actions.selectAllInReview()}>
          {REVIEW_TEXTS.selectAllInReview}
        </button>
        <span className="tl-details__spacer" />
        <button
          type="button"
          className="tl-button tl-button--small"
          data-testid="review-accept-group"
          disabled={!controls.acceptGroup.enabled}
          title={controls.acceptGroup.title}
          onClick={() => actions.acceptSelected()}
        >
          {controls.acceptGroup.label}
        </button>
        <button
          type="button"
          className="tl-button tl-button--secondary tl-button--small"
          data-testid="review-decline-group"
          aria-expanded={menu !== null}
          disabled={!controls.declineGroup.enabled}
          title={controls.declineGroup.title}
          onClick={() => (menu !== null ? actions.closeDeclineMenu() : actions.openDeclineMenu(selected, 'group'))}
        >
          {REVIEW_TEXTS.declineEllipsis}
        </button>
      </div>
      {menu !== null ? <DeclineMenu entries={groupDeclineEntries(session.items, menu.items)} testId="decline-menu-group" /> : null}
      {lastGroup !== null ? (
        <p className="tl-review-list__left" data-testid="review-left" role="status">
          <Marked text={lastGroup} phrases={phrases} />
        </p>
      ) : null}
    </div>
  );
}

function Group({ group, current, selected, busyItems }: { group: ReviewGroup; current: string | null; selected: readonly string[]; busyItems: readonly string[] }) {
  const actions = useBoardActions();
  const titleId = `tl-review-group-${group.key.replace(/[^A-Za-z0-9_-]/g, '_')}-${group.rows[0]?.id ?? ''}`;
  return (
    <div role="group" aria-labelledby={titleId} className="tl-review-group" data-testid="review-group" data-group={group.key} data-target={group.target || undefined}>
      <div id={titleId} className="tl-review-group__title" data-off-board={!group.onBoard || undefined}>
        <Label parts={group.title} />
        {group.summary !== undefined ? <span className="tl-review-group__summary"> · {group.summary}</span> : null}
      </div>
      {group.rows.map((row) => {
        const isSelected = selected.includes(row.id);
        return (
          <div
            key={row.id}
            id={rowDomId(row.id)}
            role="option"
            aria-selected={isSelected}
            aria-current={row.id === current || undefined}
            className="tl-review-row"
            data-testid="review-row"
            data-item={row.id}
            data-status={row.status}
            data-current={row.id === current || undefined}
            onClick={() => actions.focusItem(row.id)}
          >
            <input
              type="checkbox"
              className="tl-review-row__check"
              data-testid="review-row-check"
              tabIndex={-1}
              checked={isSelected}
              disabled={!row.selectable}
              aria-label="Select"
              onClick={(event) => event.stopPropagation()}
              onChange={() => actions.toggleItemSelected(row.id)}
            />
            <StatusMark glyph={row.glyph} word={row.word} status={row.status} />
            <span className="tl-review-row__label">
              <Label parts={row.label} />
            </span>
            <Badges badges={row.badges} markers={row.markers} />
            {busyItems.includes(row.id) ? <Spinner label="Deciding…" /> : null}
          </div>
        );
      })}
    </div>
  );
}

/** The list and the detail (or, in a narrow panel, one of them). */
export function ReviewArea({ session }: { session: SessionView }) {
  const review = useBoard((s) => s.sessionReview);
  const selected = useBoard((s) => s.selectedItems);
  const busyItems = useBoard((s) => s.sessionBusy?.items ?? EMPTY);
  const actions = useBoardActions();
  const [area, width] = useWidth();
  const list = useRef<HTMLDivElement>(null);
  const nodes = Object.fromEntries(session.board.graph.nodes.map((n) => [n.id, n]));
  const groups = reviewRows(session.items, session.inferences, nodes, review?.filter ?? 'all');
  const ids = rowIds(groups);
  const current = review?.current ?? null;
  const item: ItemView | undefined = session.items.find((i) => i.id === current);
  const mode = paneModeFor(width, review?.pane ?? 'list');
  // The current row stays in view as the keys move it.
  useLayoutEffect(() => {
    if (current === null) return;
    list.current?.querySelector(`#${CSS.escape(rowDomId(current))}`)?.scrollIntoView({ block: 'nearest' });
  }, [current]);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || isTextEntry(event.target)) return;
    if (actions.pressReviewKey(event)) {
      event.preventDefault();
      event.stopPropagation();
    }
  };
  const readOnly = readOnlyReason(session);
  return (
    <div ref={area} className="tl-review-area" data-testid="review-area" data-mode={mode}>
      {mode !== 'detail' ? (
        <div className="tl-review-list">
          <Header session={session} selected={selected} />
          {readOnly !== null ? (
            <p className="tl-run__hint" data-testid="review-readonly">
              {readOnly}
            </p>
          ) : null}
          {ids.length === 0 ? (
            <p className="tl-run__hint" data-testid="review-empty">
              {session.phase === 'step' ? REVIEW_TEXTS.reviewWaits : NOTHING_TO_REVIEW}
            </p>
          ) : null}
          <div
            ref={list}
            className="tl-review-list__box"
            data-testid="review-list"
            role="listbox"
            tabIndex={0}
            aria-label={countsText(session.counts)}
            aria-multiselectable="true"
            aria-activedescendant={current !== null && ids.includes(current) ? rowDomId(current) : undefined}
            onKeyDown={onKeyDown}
          >
            {groups.map((g) => (
              <Group key={`${g.key}-${g.rows[0]?.id ?? ''}`} group={g} current={current} selected={selected} busyItems={busyItems} />
            ))}
          </div>
        </div>
      ) : null}
      {mode !== 'list' && item !== undefined ? <ItemDetail item={item} session={session} ids={ids} narrow={mode === 'detail'} /> : null}
      {mode === 'detail' && item === undefined ? (
        <button type="button" className="tl-link" onClick={() => actions.setReviewPane('list')}>
          {REVIEW_TEXTS.allItems}
        </button>
      ) : null}
    </div>
  );
}

const EMPTY: readonly string[] = [];
