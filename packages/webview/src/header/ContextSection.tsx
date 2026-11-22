/**
 * The Context Menu section (spec v4.1 CM-1–CM-5; slice 1e), which replaces the tray at the bottom: one row of fixed
 * height right below the toolbar, labelled "Context Menu", so selecting never reflows the toolbar. With nothing
 * selected it reads "Select some items to see possible actions here." (on a board without cards, how to add the first
 * one). Otherwise the selection in one line ("2 arrows into “X”", "3 cards"; every item on hover, with what the
 * selected statements presuppose, D-3b), the labelled
 * **Formalize for dependencies** button (CM-3; disabled with the reason on hover), and the other actions that fit the
 * selection as icons with their labels on hover. On a narrow window the actions that do not fit go into a "…" menu.
 * The model is board/contextActions.ts; the actions run through board/runAction.ts, shared with the right-click menu.
 *
 * Slice 2h (§5.10, §5.11, CM-2, RV-8): during an edit session, Formalize is a mid-stage Formalize of the Proposed view
 * (while the results are hidden its reason comes with Show results, D2-65), and the selection's review items (the items
 * selected in the list or on the board, and the marks of the selected cards) are listed as "N review items" with Accept
 * ("Accept k of N", core `planGroupAccept`'s preview) and Decline… (one option for all, the plain decline for arrow
 * items): one `decideItems`, `own: false` (D2-32).
 */
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { REVIEW_TEXTS } from '@telelean/core';
import { contextActions, CONTEXT_ICONS, fittingActions, FORMALIZE_LABEL, FORMALIZE_TEXTS, reviewItemsModel, selectionCards, summaryTitle as titleWithPresuppositions, type ContextAction, type ContextEntry } from '../board/contextActions';
import type { MenuReview, MenuThing } from '../board/menu';
import { groupDeclineEntries } from '../model/review';
import { contextItems } from '../model/sessionBoard';
import { DeclineMenu } from '../run/review/DeclineMenu';
import { runBoardAction } from '../board/runAction';
import { useFormalize } from '../board/useFormalize';
import { Popover } from '../common/Popover';
import { presuppositionLabel, presuppositionsOf } from '../model/cardData';
import { useBoard, useBoardActions, useBoardStore } from '../state/context';
import { boardView, editLock, proposedOverlay } from '../state/store';

/** The icon buttons' width and the "…" button's (px), for the narrow window's overflow (CM-3). */
const ICON_WIDTH = 26;
const MORE_WIDTH = 26;

/** What the section shows on a board without cards (the tray's first-step hint before 1e). */
function FirstStep() {
  return (
    <span className="tl-context__empty tl-context__empty--start" data-testid="first-step">
      <span className="codicon codicon-arrow-down" aria-hidden="true" /> No cards yet: type something you believe in the box below and press Enter. It becomes
      your first axiom.
    </span>
  );
}

export function ContextSection() {
  const nodes = useBoard((s) => boardView(s).nodes);
  const selected = useBoard((s) => s.selected);
  const selectedArrows = useBoard((s) => s.selectedArrows);
  const selectedMarks = useBoard((s) => s.selectedMarks);
  const expanded = useBoard((s) => s.expanded);
  const provisional = useBoard((s) => s.provisional);
  const lock = useBoard((s) => editLock(s));
  const proposed = useBoard((s) => proposedOverlay(s) !== null);
  const starting = useBoard((s) => s.runBusy?.action === 'start');
  const empty = useBoard((s) => s.version !== null && Object.keys(s.nodes).length === 0);
  const subject = useBoard((s) => s.subject);
  const vocab = useBoard((s) => s.vocab);
  const formalize = useFormalize();
  const actions = useBoardActions();
  const store = useBoardStore();
  // Slice 2h: the session's review, while its Proposed view is on screen; the selection's review items.
  const overlay = useBoard((s) => proposedOverlay(s));
  const session = useBoard((s) => s.session);
  const busy = useBoard((s) => s.sessionBusy !== null);
  const selectedItems = useBoard((s) => s.selectedItems);
  const declineMenu = useBoard((s) => (s.declineMenu?.origin === 'context' ? s.declineMenu : null));
  const review = useMemo<MenuReview | undefined>(
    () => (overlay !== null && session !== null ? { items: session.items, phase: session.phase, busy, marks: overlay.marks, locations: overlay.locations } : undefined),
    [overlay, session, busy],
  );
  const items = useMemo(
    () => (session !== null && overlay !== null ? reviewItemsModel(session, contextItems(session, selectedItems, selected), busy) : null),
    [session, overlay, selectedItems, selected, busy],
  );
  const model = useMemo(
    () => contextActions({ nodes, selected, selectedArrows, selectedMarks, expanded, provisional, lock, proposed, ...(review !== undefined ? { review } : {}) }, formalize),
    [nodes, selected, selectedArrows, selectedMarks, expanded, provisional, lock, proposed, review, formalize],
  );
  const [declineAnchor, setDeclineAnchor] = useState<HTMLElement | null>(null);

  // D-3b (the tray's "+ presupposes" chips before 1e): what the selection's statements presuppose, on the summary's
  // hover: the question's cards (the selected arrows' ends, the marked cards) and the selected cards (fixer 1e).
  const presupposes = useMemo(
    () => presuppositionsOf(selectionCards({ nodes, selected, selectedArrows, selectedMarks }), nodes).map((name) => presuppositionLabel(name, subject, vocab)),
    [selected, selectedArrows, selectedMarks, nodes, subject, vocab],
  );
  const summaryTitle = model.summary === null ? '' : titleWithPresuppositions(model.summary, presupposes);

  // CM-3: on a narrow window the actions that do not fit go into the "…" menu.
  const actionsRef = useRef<HTMLSpanElement>(null);
  const [room, setRoom] = useState<number | null>(null);
  useLayoutEffect(() => {
    const element = actionsRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const measure = () => setRoom(element.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [model.summary !== null]);
  const shown = room === null ? model.entries.length : fittingActions(room, model.entries.length, ICON_WIDTH, MORE_WIDTH);
  const visible = model.entries.slice(0, shown);
  const overflow = model.entries.slice(shown);
  const [moreAnchor, setMoreAnchor] = useState<HTMLElement | null>(null);

  /** One selected card (the model's, the same the entries were built for): its actions are about it; Formalize and Delete act on the selection. */
  const card = model.card;
  const run = (action: ContextAction) => {
    setMoreAnchor(null);
    const thing: MenuThing | null = card !== null ? { kind: 'card', id: card } : null;
    runBoardAction(action, thing, { actions, store, nodes });
  };

  if (model.summary === null && items === null) {
    return (
      <section className="tl-context" aria-label="Context Menu" data-testid="context-menu" data-empty="true">
        <span className="tl-context__label">Context Menu</span>
        {empty ? <FirstStep /> : <span className="tl-context__empty" data-testid="context-empty">{FORMALIZE_TEXTS.empty}</span>}
      </section>
    );
  }

  const icon = (entry: ContextEntry, menu: boolean) =>
    menu ? (
      <button
        key={entry.action}
        type="button"
        role="menuitem"
        className="tl-menu__item"
        data-action={entry.action}
        disabled={entry.disabled !== null}
        title={entry.disabled ?? undefined}
        onClick={() => run(entry.action)}
      >
        <span className={`codicon codicon-${CONTEXT_ICONS[entry.action]}`} aria-hidden="true" /> <span className="tl-menu__text">{entry.label}</span>
      </button>
    ) : (
      <button
        key={entry.action}
        type="button"
        className="tl-icon-button tl-icon-button--toolbar"
        data-action={entry.action}
        aria-label={entry.label}
        title={entry.disabled !== null ? `${entry.label}: ${entry.disabled}` : entry.label}
        disabled={entry.disabled !== null}
        onClick={() => run(entry.action)}
      >
        <span className={`codicon codicon-${entry.icon}`} aria-hidden="true" />
      </button>
    );

  const summaryText = [model.summary?.text, items?.text].filter((t): t is string => t !== undefined).join(' · ');
  return (
    <section className="tl-context" aria-label="Context Menu" data-testid="context-menu">
      <span className="tl-context__label">Context Menu</span>
      <span className="tl-context__summary" data-testid="context-summary" title={summaryTitle}>
        {summaryText}
      </span>
      <button
        type="button"
        className="tl-button tl-button--small tl-context__formalize"
        data-testid="formalize"
        disabled={model.formalize.disabled !== null || starting}
        title={model.formalize.title}
        onClick={() => actions.formalize()}
      >
        {starting ? <span className="codicon codicon-loading codicon-modifier-spin" aria-hidden="true" /> : null}
        {FORMALIZE_LABEL}
      </button>
      {model.formalize.disabled !== null ? (
        <span className="tl-context__reason" data-testid="formalize-reason" title={model.formalize.disabled}>
          {model.formalize.disabled}
        </span>
      ) : null}
      {/* D2-65: while the results are hidden, Formalize waits for them: Show results is offered beside the reason. */}
      {model.formalize.showResults === true ? (
        <button type="button" className="tl-button tl-button--small tl-button--secondary" data-testid="formalize-show-results" disabled={busy} onClick={() => actions.openReveal('show-result')}>
          {REVIEW_TEXTS.showResults}
        </button>
      ) : null}
      {/* Slice 2h (CM-2, RV-8): the selection's review items, decided as a group (own: false). */}
      {items !== null ? (
        <>
          <button
            type="button"
            className="tl-button tl-button--small"
            data-testid="context-accept"
            disabled={!items.accept.enabled}
            title={items.accept.title}
            onClick={() => actions.acceptGroup(items.items)}
          >
            {items.accept.label}
          </button>
          <button
            type="button"
            className="tl-button tl-button--small tl-button--secondary"
            data-testid="context-decline"
            disabled={!items.decline.enabled}
            title={items.decline.title}
            aria-expanded={declineMenu !== null}
            onClick={(event) => {
              if (declineMenu !== null) {
                actions.closeDeclineMenu();
                setDeclineAnchor(null);
              } else {
                actions.openDeclineMenu(items.items, 'context');
                setDeclineAnchor(event.currentTarget);
              }
            }}
          >
            {REVIEW_TEXTS.declineEllipsis}
          </button>
          <Popover
            anchor={declineAnchor}
            open={declineMenu !== null && declineAnchor !== null}
            onClose={() => {
              actions.closeDeclineMenu();
              setDeclineAnchor(null);
            }}
            role="dialog"
            label={REVIEW_TEXTS.declineEllipsis}
            testId="context-decline-menu"
            className="tl-menu"
            align="end"
          >
            {declineMenu !== null && session !== null ? <DeclineMenu entries={groupDeclineEntries(session.items, declineMenu.items)} testId="decline-menu-context" /> : null}
          </Popover>
        </>
      ) : null}
      <span className="tl-context__actions" ref={actionsRef} data-testid="context-actions">
        {visible.map((entry) => icon(entry, false))}
        {overflow.length > 0 ? (
          <>
            <button
              type="button"
              className="tl-icon-button tl-icon-button--toolbar"
              data-testid="context-more"
              aria-label="More actions"
              title="More actions"
              aria-expanded={moreAnchor !== null}
              onClick={(event) => setMoreAnchor(moreAnchor === null ? event.currentTarget : null)}
            >
              <span className="codicon codicon-ellipsis" aria-hidden="true" />
            </button>
            <Popover anchor={moreAnchor} open={moreAnchor !== null} onClose={() => setMoreAnchor(null)} role="menu" label="More actions" testId="context-more-menu" className="tl-menu" align="end">
              {overflow.map((entry) => icon(entry, true))}
            </Popover>
          </>
        ) : null}
      </span>
    </section>
  );
}
