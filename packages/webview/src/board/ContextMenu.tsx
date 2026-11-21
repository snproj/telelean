/**
 * The right-click menu (spec v4 CM-7; slice 1c): at the pointer, the actions for the card, arrow, mark or empty canvas
 * under it (board/menu.ts lists them; BoardInput opens it after a right click without movement and has applied the
 * selection rule). It is a common/Popover menu hanging from a 1-pixel anchor placed at the pointer through the CSSOM;
 * when it closes, the focus goes back to the card (or the canvas) it was about. Slice 1e: a drawn arrow's and a
 * mark's menus offer Formalize for dependencies as the header's Context Menu section does (board/useFormalize.ts),
 * and every action runs through board/runAction.ts, shared with that section.
 */
import { Fragment, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Popover } from '../common/Popover';
import { useBoard, useBoardActions, useBoardStore } from '../state/context';
import { boardView, editLock, proposedOverlay } from '../state/store';
import type { MenuRequest } from './BoardInput';
import type { CanvasView } from './canvas/CanvasView';
import { menuEntries, menuName, type MenuAction, type MenuThing } from './menu';
import { runBoardAction } from './runAction';
import { useFormalize } from './useFormalize';

function menuLabel(thing: MenuThing, name: (id: string) => string): string {
  switch (thing.kind) {
    case 'card':
      return `Actions for “${name(thing.id)}”`;
    case 'arrow':
      return `Actions for the arrow from “${name(thing.source)}” into “${name(thing.target)}”`;
    case 'undeclared':
      return `Actions for the arrow the proof of “${name(thing.target)}” uses from “${name(thing.source)}” (not drawn)`;
    case 'mark':
      return `Actions for the "follows from nothing" mark of “${name(thing.id)}”`;
    case 'canvas':
      return 'Canvas actions';
  }
}

export function ContextMenu({ menu, onClose, canvas }: { menu: MenuRequest | null; onClose: () => void; canvas: CanvasView }) {
  const nodes = useBoard((s) => boardView(s).nodes);
  const selected = useBoard((s) => s.selected);
  const selectedArrows = useBoard((s) => s.selectedArrows);
  const selectedMarks = useBoard((s) => s.selectedMarks);
  const expanded = useBoard((s) => s.expanded);
  const provisional = useBoard((s) => s.provisional);
  const lock = useBoard((s) => editLock(s));
  const proposed = useBoard((s) => proposedOverlay(s) !== null);
  const formalize = useFormalize();
  const actions = useBoardActions();
  const store = useBoardStore();
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const element = anchorRef.current;
    if (!element || !menu) {
      setAnchor(null);
      return;
    }
    element.style.setProperty('left', `${Math.round(menu.x)}px`);
    element.style.setProperty('top', `${Math.round(menu.y)}px`);
    setAnchor(element);
  }, [menu]);

  const entries = useMemo(
    () => (menu ? menuEntries(menu.thing, { nodes, selected, selectedArrows, selectedMarks, expanded, provisional, lock, proposed, formalize }) : []),
    [menu, nodes, selected, selectedArrows, selectedMarks, expanded, provisional, lock, proposed, formalize],
  );

  const run = (action: MenuAction) => {
    const thing = menu?.thing;
    onClose();
    if (!thing) return;
    runBoardAction(action, thing, { actions, store, nodes, canvas });
  };

  return (
    <>
      <span ref={anchorRef} className="tl-menu-anchor" aria-hidden="true" />
      <Popover
        anchor={menu ? anchor : null}
        open={menu !== null && anchor !== null}
        onClose={onClose}
        role="menu"
        label={menu ? menuLabel(menu.thing, (id) => menuName(nodes, id)) : undefined}
        testId="board-menu"
        className="tl-menu tl-board-menu"
        returnFocus={menu?.returnFocus ?? null}
      >
        {entries.map((entry, i) => (
          <Fragment key={entry.action}>
            {entry.group && i > 0 ? <div className="tl-menu__separator" role="separator" /> : null}
            <button
              type="button"
              role="menuitem"
              className="tl-menu__item"
              data-action={entry.action}
              disabled={entry.disabled !== null}
              title={entry.disabled ?? undefined}
              onClick={() => run(entry.action)}
            >
              <span className="tl-menu__text">{entry.label}</span>
            </button>
          </Fragment>
        ))}
      </Popover>
    </>
  );
}
