/**
 * The Context Menu section (spec v4.1 CM-1–CM-5; slice 1e), which replaces the tray at the bottom: one row of fixed
 * height right below the toolbar, labelled "Context Menu", so selecting never reflows the toolbar. With nothing
 * selected it reads "Select some items to see possible actions here." (on a board without cards, how to add the first
 * one). Otherwise the selection in one line ("2 arrows into “X”", "3 cards"; every item on hover, with what the
 * selected statements presuppose, D-3b), the labelled
 * **Formalize for dependencies** button (CM-3; disabled with the reason on hover), and the other actions that fit the
 * selection as icons with their labels on hover. On a narrow window the actions that do not fit go into a "…" menu.
 * The model is board/contextActions.ts; the actions run through board/runAction.ts, shared with the right-click menu.
 */
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { contextActions, CONTEXT_ICONS, fittingActions, FORMALIZE_LABEL, FORMALIZE_TEXTS, selectionCards, summaryTitle as titleWithPresuppositions, type ContextAction, type ContextEntry } from '../board/contextActions';
import type { MenuThing } from '../board/menu';
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
  const model = useMemo(
    () => contextActions({ nodes, selected, selectedArrows, selectedMarks, expanded, provisional, lock, proposed }, formalize),
    [nodes, selected, selectedArrows, selectedMarks, expanded, provisional, lock, proposed, formalize],
  );

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

  if (model.summary === null) {
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

  return (
    <section className="tl-context" aria-label="Context Menu" data-testid="context-menu">
      <span className="tl-context__label">Context Menu</span>
      <span className="tl-context__summary" data-testid="context-summary" title={summaryTitle}>
        {model.summary.text}
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
