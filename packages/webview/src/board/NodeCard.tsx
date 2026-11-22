import { draggable, dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/adapter/element-adapter';
import { combine } from '@atlaskit/pragmatic-drag-and-drop/utils/combine';
import { attachClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge/attach-closest-edge';
import { extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge/extract-closest-edge';
import type { Edge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/types';
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { InlineEdit } from '../common/OneLineInput';
import { KIND_GLYPH, KIND_NOUN } from '../labels';
import { attentionDiagnostics, cardChips, cardGlow, type Chip } from '../model/cardData';
import { plainText } from '../model/format';
import { markGlyph, markText, RESULT_CHIP_KEYS, RESULT_HIDDEN_CHIP, type CardMark } from '../model/sessionBoard';
import { useBoard, useBoardActions, useBoardStore } from '../state/context';
import { boardView, editLock, flashTarget, gestureGateOf, proposedOverlay } from '../state/store';
import { CardDetails } from './CardDetails';
import { cardDragData, cardTargetData, isCardDragData } from './dnd';
import { guardCardDrag } from './dragGuard';
import { revealCard, revealInColumn } from './reveal';
import { UsesLine } from './UsesLine';

/**
 * Slice 2h (§5.10): a card's review item in a session's Proposed view (ItemMark replaces M2's DiffBadge): glyph, word
 * and status, never colour alone ("+ new · in review", "~ Formalize · accepted ✓"). A click shows the item in the review
 * panel; Ctrl/Cmd+click adds it to (or takes it from) the items selected for a group decision (CM-2).
 */
export function ItemMark({ mark }: { mark: CardMark }) {
  const actions = useBoardActions();
  const selected = useBoard((s) => s.selectedItems.includes(mark.item));
  const glyph = markGlyph(mark.kind);
  const text = markText(mark);
  return (
    <button
      type="button"
      className="tl-mark-item"
      data-testid="item-mark"
      data-item={mark.item}
      data-kind={mark.kind}
      data-status={mark.status}
      data-mark={glyph === '+' ? 'added' : glyph === '−' ? 'removed' : 'changed'}
      data-selected={selected || undefined}
      aria-pressed={selected}
      title={`${text}: show it in the review (Ctrl+click: select it for a group decision)`}
      onClick={(event) => {
        event.stopPropagation();
        if (event.ctrlKey || event.metaKey) actions.toggleItemSelected(mark.item);
        else actions.focusItem(mark.item);
      }}
    >
      {text}
    </button>
  );
}

function ChipView({
  chip,
  onAction,
  locked = null,
}: {
  chip: Chip;
  onAction?: ((action: NonNullable<Chip['action']>) => void) | undefined;
  /** Slice 1f (ES-9): an action chip is disabled, with this reason as its tooltip. */
  locked?: string | null;
}) {
  const className = `tl-chip tl-chip--${chip.tone}${chip.action && onAction ? ' tl-chip--action' : ''}`;
  if (chip.action && onAction) {
    const action = chip.action;
    return (
      <button
        type="button"
        className={className}
        data-chip={chip.key}
        data-dim={chip.dim || undefined}
        title={locked ?? plainText(chip.title)}
        disabled={locked !== null}
        onClick={(event) => {
          event.stopPropagation();
          onAction(action);
        }}
      >
        {chip.label}
      </button>
    );
  }
  return (
    <span className={className} data-chip={chip.key} data-dim={chip.dim || undefined} title={plainText(chip.title)}>
      {chip.label}
    </span>
  );
}

/**
 * A card of the board. `place` (spec v4 slice 1c): in the AXIOMS `column` it is dragged to re-order it
 * (pragmatic-drag-and-drop, as before) and Alt+↑/↓ moves it; on the `canvas` the board's pointer handlers move it
 * (board/BoardInput.ts), so it registers no HTML drag.
 *
 * Slice 1c2 (AR-1): the arrow handle at its right edge, shown while the card is hovered: dragging it to another card
 * draws an arrow (BoardInput). While the board is locked (ES-9) and in the Proposed view it is shown disabled, with the
 * reason as its tooltip (slice 1d); it is not there on a card the host has not written yet. Delete removes the selected
 * arrows and marks first; the card's delete dialog opens only when none is selected (`pressDelete`).
 *
 * Slice 1d (BD-6): its glow (`data-glow`): green when established, else blue when formalised, dimmed when its facts are
 * out of date (`data-glow-dim`), never green while the Proposed view hides its result.
 */
export const NodeCard = memo(function NodeCard({ id, place = 'column' }: { id: string; place?: 'column' | 'canvas' }) {
  const node = useBoard((s) => boardView(s).nodes[id]);
  const nodes = useBoard((s) => boardView(s).nodes);
  const diagnostics = useBoard((s) => s.diagnostics);
  const selected = useBoard((s) => s.selected.includes(id));
  const expanded = useBoard((s) => s.expanded[id] === true);
  const dragging = useBoard((s) => s.drag?.id === id);
  const provisional = useBoard((s) => s.provisional[id] === true);
  const flashed = useBoard((s) => (s.flash?.target === flashTarget.node(id) ? s.flash.token : 0));
  const proposed = useBoard((s) => proposedOverlay(s) !== null);
  // Slice 2h: the card's review items (listed ones; a hidden Result never: its target's chip stands for it).
  const marks = useBoard((s) => proposedOverlay(s)?.marks[id]);
  const hideResult = useBoard((s) => proposedOverlay(s)?.hidden.has(id) === true);
  const editing = useBoard((s) => (s.editing?.id === id && proposedOverlay(s) === null ? s.editing.field : null));
  const checking = useBoard((s) => s.semantic.state === 'checking');
  /** Slice 1f (ES-9): the Current board is read-only while an edit session (a run) is active. */
  const lock = useBoard((s) => editLock(s));
  /**
   * AR-1: the arrow handle (slice 1c2). Slice 1d (ES-9, the 1c2 verification's carry-over): where no arrow can be drawn
   * now, in the Proposed view or during an edit session, it is shown disabled with the reason as its tooltip, never
   * hidden; it is not a handle then (no `data-handle`), so a press on it draws nothing. None on a card the host has not
   * written yet. The reason is the drawing gesture's own rule (1c2's `gestureGateOf(…).draw`; 1d fixer), so the handle
   * and the gesture always agree.
   */
  const handleBlocked = useBoard((s) => gestureGateOf(s).draw);
  const actions = useBoardActions();
  const store = useBoardStore();
  const ref = useRef<HTMLDivElement>(null);
  const [dropEdge, setDropEdge] = useState<Edge | null>(null);

  useEffect(() => {
    const element = ref.current;
    // On the canvas a card moves with pointer events (BoardInput.ts), never with an HTML drag.
    if (!element || place === 'canvas') return;
    const guard = guardCardDrag(element);
    return combine(
      () => guard.dispose(),
      draggable({
        element,
        getInitialData: () => cardDragData(id),
        // A press in the code, a field or a button never drags the card (request 1); neither does a card the host
        // has not confirmed yet, nor any card of the proposed view (read-only: it is not the user's files), nor any
        // card while an edit session is active (slice 1f, ES-9: no re-order, no kind change by a drop).
        canDrag: () => !guard.blocked() && !actions.isProvisional(id) && proposedOverlay(store.getState()) === null && editLock(store.getState()) === null,
      }),
      dropTargetForElements({
        element,
        // The card itself is a target too, so dropping it where it was is recognised as "no move".
        canDrop: ({ source }) => isCardDragData(source.data) && proposedOverlay(store.getState()) === null && editLock(store.getState()) === null,
        getData: ({ input, element: el }) => attachClosestEdge(cardTargetData(id), { input, element: el, allowedEdges: ['top', 'bottom'] }),
        onDrag: ({ self, source }) => {
          const edge = isCardDragData(source.data) && source.data.id !== id ? extractClosestEdge(self.data) : null;
          setDropEdge((current) => (current === edge ? current : edge));
        },
        onDragLeave: () => setDropEdge(null),
        onDrop: () => setDropEdge(null),
      }),
    );
  }, [id, actions, store, place]);

  // A highlight scrolls the column to the card, or pans and zooms the canvas to it (BD-3).
  useLayoutEffect(() => {
    if (flashed && ref.current) revealCard(ref.current);
  }, [flashed]);

  const chips = useMemo(() => {
    if (!node) return [];
    const all = cardChips(node, nodes, checking);
    // A target's result stays hidden until the stage's reveal (RV-6, D2-61: meaning before proof status).
    return hideResult ? [...all.filter((chip) => !RESULT_CHIP_KEYS.has(chip.key)), RESULT_HIDDEN_CHIP as Chip] : all;
  }, [node, nodes, checking, hideResult]);
  // The board's diagnostics describe the current files, not the proposal.
  const attention = useMemo(() => (proposed ? [] : attentionDiagnostics(diagnostics, id)), [diagnostics, id, proposed]);

  if (!node) return null;
  const agentWorded = node.provenance.wordedBy === 'agent';
  // Spec v4.1 BD-6 (slice 1d): green when established, else blue when formalised; dimmed when the facts are out of date.
  // While the Proposed view hides the result, never green (RV-6).
  const glow = cardGlow(node, hideResult);

  const onChipAction = (action: NonNullable<Chip['action']>) => {
    if (action === 'edit-rationale') actions.startEdit(id, 'rationale');
  };
  // A locked Current board still selects (viewing stays, slice 1f); slice 2h: so does a session's Proposed view (RV-9).
  const onClick = (event: MouseEvent) => {
    if (gestureGateOf(store.getState()).select) actions.clickCard(id, event.ctrlKey || event.metaKey);
  };
  /** After an inline edit is saved or cancelled from the keyboard, the focus goes back to the card. */
  const focusCard = () => ref.current?.focus();
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.target !== event.currentTarget) return;
    if (proposed) {
      // Nothing of the Current board is edited here: expanding and (slice 2h) selecting work.
      if (event.key === 'Enter') {
        event.preventDefault();
        actions.toggleExpanded(id);
      } else if (event.key === ' ' && gestureGateOf(store.getState()).select) {
        event.preventDefault();
        actions.clickCard(id, true);
      }
      return;
    }
    if (place === 'column' && event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      // The keyboard re-order: one place up or down in the column (layout only, like a drag within it). While the
      // board is locked (slice 1f) the store moves nothing and says why; so do F2 and Delete below.
      event.preventDefault();
      if (actions.moveCard(id, event.key === 'ArrowUp' ? -1 : 1)) {
        // React moves the card's element, which drops its focus: give it back once the column re-rendered.
        requestAnimationFrame(() => {
          const card = document.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(id)}"]`);
          if (!card) return;
          card.focus({ preventScroll: true });
          revealInColumn(card);
        });
      }
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      actions.toggleExpanded(id);
    } else if (event.key === ' ') {
      event.preventDefault();
      actions.clickCard(id, true);
    } else if (event.key === 'F2') {
      event.preventDefault();
      actions.startEdit(id, 'naturalName');
    } else if (event.key === 'Delete') {
      event.preventDefault();
      // Spec v4 AR-1: with arrows or marks selected, Delete removes them; it opens the card's delete dialog only when
      // none is selected (cards are never deleted together with arrows). Locked: the reason, nothing sent.
      actions.pressDelete(id);
    }
  };
  const problems = attention.length;

  return (
    <div
      ref={ref}
      className="tl-card"
      role="listitem"
      tabIndex={0}
      data-node-id={id}
      data-kind={node.type}
      data-place={place}
      data-formal={node.status.formal}
      data-glow={glow.glow ?? undefined}
      data-glow-dim={glow.dim || undefined}
      data-selected={selected || undefined}
      data-expanded={expanded || undefined}
      data-dragging={dragging || undefined}
      data-drop-edge={dropEdge ?? undefined}
      data-provisional={provisional || undefined}
      data-highlight={flashed ? 'true' : undefined}
      data-proposed={proposed || undefined}
      data-locked={(!proposed && lock !== null) || undefined}
      data-marked={marks !== undefined && marks.length > 0 ? 'true' : undefined}
      aria-label={`${KIND_NOUN[node.type]}: ${node.naturalName}${selected ? ' (selected)' : ''}${marks !== undefined && marks.length > 0 ? ` (${marks.map(markText).join(', ')})` : ''}`}
      aria-keyshortcuts={proposed ? 'Enter Space' : lock !== null ? 'Enter Space' : place === 'column' ? 'Enter Space F2 Delete Alt+ArrowUp Alt+ArrowDown' : 'Enter Space F2 Delete'}
      onClick={onClick}
      onKeyDown={onKeyDown}
      onMouseEnter={() => actions.setHover(id)}
      onMouseLeave={() => actions.setHover(null)}
    >
      {/* Slice 2h: the review items' marks on a line of their own, so the sentence keeps the whole width of the card. */}
      {marks !== undefined && marks.length > 0 ? (
        <div className="tl-card__diffline" data-testid="item-marks">
          {marks.map((m) => (
            <ItemMark key={m.item} mark={m} />
          ))}
        </div>
      ) : null}
      <div className="tl-card__row">
        {editing === 'naturalName' ? (
          <InlineEdit
            initial={node.naturalName}
            aria-label="Edit the sentence"
            onCommit={(value) => {
              actions.stopEdit();
              actions.editNode(id, 'naturalName', value);
            }}
            onCancel={() => actions.stopEdit()}
            returnFocus={focusCard}
          />
        ) : (
          <span className={agentWorded ? 'tl-card__text tl-card__text--agent' : 'tl-card__text'} data-provenance={agentWorded ? 'agent' : 'user'}>
            {node.naturalName}
            {agentWorded ? <span className="tl-card__agent-marker tl-agent__marker"> (Claude's wording)</span> : null}
          </span>
        )}
        {selected ? <span className="codicon codicon-check tl-card__check" title="Selected" aria-hidden="true" /> : null}
        <span className="tl-glyph" data-kind={node.type} title={KIND_NOUN[node.type]}>
          {KIND_GLYPH[node.type]}
        </span>
        <button
          type="button"
          className="tl-card__chevron"
          aria-expanded={expanded}
          aria-label={expanded ? 'Hide details' : 'Show Lean code and details'}
          onClick={(event) => {
            event.stopPropagation();
            actions.toggleExpanded(id);
          }}
        >
          <span className={`codicon codicon-chevron-${expanded ? 'down' : 'right'}`} aria-hidden="true" />
        </button>
      </div>
      {editing === 'rationale' ? (
        <div className="tl-card__because tl-card__because--editing">
          <span>because:</span>
          <InlineEdit
            initial={node.rationale ?? ''}
            aria-label="Edit the reason"
            placeholder="Leave empty to remove the reason"
            onCommit={(value) => {
              actions.stopEdit();
              actions.editNode(id, 'rationale', value);
            }}
            onCancel={() => actions.stopEdit()}
            returnFocus={focusCard}
          />
        </div>
      ) : node.rationale ? (
        <div className="tl-card__because">because: {node.rationale}</div>
      ) : null}
      <div className="tl-card__meta">
        {chips.map((chip) => (
          <ChipView key={chip.key} chip={chip} onAction={proposed ? undefined : onChipAction} locked={proposed ? null : lock} />
        ))}
        {problems > 0 ? (
          <button
            type="button"
            className="tl-attention"
            data-testid="attention"
            title={attention.map((d) => `${d.code}: ${plainText(d.message)}`).join('\n')}
            aria-label={`${problems} problem${problems === 1 ? '' : 's'} need${problems === 1 ? 's' : ''} attention`}
            onClick={(event) => {
              event.stopPropagation();
              actions.setExpanded(id, true);
            }}
          >
            <span className="codicon codicon-warning" aria-hidden="true" />
            {problems}
          </button>
        ) : null}
        {provisional ? (
          <span className="tl-chip tl-chip--subtle" data-chip="provisional" title="Waiting for the extension to write this card">
            saving…
          </span>
        ) : null}
      </div>
      {node.lean.uses ? <UsesLine node={node} /> : null}
      {expanded ? <CardDetails node={node} /> : null}
      {provisional ? null : handleBlocked === null ? (
        <span className="tl-handle" data-handle="" data-nodrag="" aria-hidden="true" title="Drag to another card to draw an arrow from this one" />
      ) : (
        <span className="tl-handle" data-handle-disabled="" data-nodrag="" aria-hidden="true" title={handleBlocked} />
      )}
    </div>
  );
});
