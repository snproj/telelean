import { draggable, dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/adapter/element-adapter';
import { combine } from '@atlaskit/pragmatic-drag-and-drop/utils/combine';
import { attachClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge/attach-closest-edge';
import { extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge/extract-closest-edge';
import type { Edge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/types';
import type { NodeDiff } from '@telelean/core';
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { InlineEdit } from '../common/OneLineInput';
import { KIND_GLYPH, KIND_NOUN } from '../labels';
import { attentionDiagnostics, cardChips, type Chip } from '../model/cardData';
import { plainText } from '../model/format';
import { DIFF_GLYPH, DIFF_WORD, diffTitle, RESULT_CHIP_KEYS } from '../model/run';
import { useBoard, useBoardActions, useBoardStore } from '../state/context';
import { boardView, flashTarget, proposedOverlay } from '../state/store';
import { CardDetails } from './CardDetails';
import { cardDragData, cardTargetData, isCardDragData } from './dnd';
import { guardCardDrag } from './dragGuard';
import { revealInColumn } from './reveal';
import { UsesLine } from './UsesLine';

/** The chip that stands for a proof result the overlay hides until the review reveals it (D-19). */
const RESULT_HIDDEN_CHIP: Chip = {
  key: 'result-hidden',
  label: 'result after the review',
  title: 'Proof status is shown after you have reviewed the statements (or pressed "Show result" in the review), so you judge their meaning first',
  tone: 'subtle',
};

/**
 * A proposal's diff mark (03 section 7): a glyph and a word as well as the colour (never colour alone), plus the halo
 * the card gets from `data-diff`.
 */
export function DiffBadge({ diff, hideResult = false }: { diff: Pick<NodeDiff, 'change' | 'fields'>; hideResult?: boolean }) {
  return (
    <span className="tl-diff" data-diff={diff.change} data-testid="diff-badge" title={diffTitle({ change: diff.change, fields: diff.fields }, hideResult)}>
      <span className="tl-diff__glyph" aria-hidden="true">
        {DIFF_GLYPH[diff.change]}
      </span>
      {DIFF_WORD[diff.change]}
    </span>
  );
}

function ChipView({ chip, onAction }: { chip: Chip; onAction?: ((action: NonNullable<Chip['action']>) => void) | undefined }) {
  const className = `tl-chip tl-chip--${chip.tone}${chip.action && onAction ? ' tl-chip--action' : ''}`;
  if (chip.action && onAction) {
    const action = chip.action;
    return (
      <button
        type="button"
        className={className}
        data-chip={chip.key}
        data-dim={chip.dim || undefined}
        title={plainText(chip.title)}
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

export const NodeCard = memo(function NodeCard({ id }: { id: string }) {
  const node = useBoard((s) => boardView(s).nodes[id]);
  const nodes = useBoard((s) => boardView(s).nodes);
  const diagnostics = useBoard((s) => s.diagnostics);
  const selected = useBoard((s) => s.selected.includes(id));
  const expanded = useBoard((s) => s.expanded[id] === true);
  const dragging = useBoard((s) => s.drag?.id === id);
  const provisional = useBoard((s) => s.provisional[id] === true);
  const flashed = useBoard((s) => (s.flash?.target === flashTarget.node(id) ? s.flash.token : 0));
  const proposed = useBoard((s) => proposedOverlay(s) !== null);
  const diff = useBoard((s) => proposedOverlay(s)?.diff.nodes[id]);
  const hideResult = useBoard((s) => proposedOverlay(s)?.hidden.has(id) === true);
  const editing = useBoard((s) => (s.editing?.id === id && proposedOverlay(s) === null ? s.editing.field : null));
  const checking = useBoard((s) => s.semantic.state === 'checking');
  const actions = useBoardActions();
  const store = useBoardStore();
  const ref = useRef<HTMLDivElement>(null);
  const [dropEdge, setDropEdge] = useState<Edge | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const guard = guardCardDrag(element);
    return combine(
      () => guard.dispose(),
      draggable({
        element,
        getInitialData: () => cardDragData(id),
        // A press in the code, a field or a button never drags the card (request 1); neither does a card the host
        // has not confirmed yet, nor any card of the proposed view (read-only: it is not the user's files).
        canDrag: () => !guard.blocked() && !actions.isProvisional(id) && proposedOverlay(store.getState()) === null,
      }),
      dropTargetForElements({
        element,
        // The card itself is a target too, so dropping it where it was is recognised as "no move".
        canDrop: ({ source }) => isCardDragData(source.data) && proposedOverlay(store.getState()) === null,
        getData: ({ input, element: el }) => attachClosestEdge(cardTargetData(id), { input, element: el, allowedEdges: ['top', 'bottom'] }),
        onDrag: ({ self, source }) => {
          const edge = isCardDragData(source.data) && source.data.id !== id ? extractClosestEdge(self.data) : null;
          setDropEdge((current) => (current === edge ? current : edge));
        },
        onDragLeave: () => setDropEdge(null),
        onDrop: () => setDropEdge(null),
      }),
    );
  }, [id, actions, store]);

  useLayoutEffect(() => {
    if (flashed && ref.current) revealInColumn(ref.current);
  }, [flashed]);

  const chips = useMemo(() => {
    if (!node) return [];
    const all = cardChips(node, nodes, checking);
    // The proposal's result stays hidden until the review reveals it (D-19: meaning before proof status).
    return hideResult ? [...all.filter((chip) => !RESULT_CHIP_KEYS.has(chip.key)), RESULT_HIDDEN_CHIP] : all;
  }, [node, nodes, checking, hideResult]);
  // The board's diagnostics describe the current files, not the proposal.
  const attention = useMemo(() => (proposed ? [] : attentionDiagnostics(diagnostics, id)), [diagnostics, id, proposed]);

  if (!node) return null;
  const agentWorded = node.provenance.wordedBy === 'agent';

  const onChipAction = (action: NonNullable<Chip['action']>) => {
    if (action === 'make-derivation') actions.requestKindChange(id, 'DERIVATION', null);
    else actions.startEdit(id, 'rationale');
  };
  // The proposed view is read-only: a click neither selects nor changes the selection.
  const onClick = (event: MouseEvent) => {
    if (!proposed) actions.clickCard(id, event.ctrlKey || event.metaKey);
  };
  /** After an inline edit is saved or cancelled from the keyboard, the focus goes back to the card. */
  const focusCard = () => ref.current?.focus();
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.target !== event.currentTarget) return;
    if (proposed) {
      // Read-only: only expanding works.
      if (event.key === 'Enter') {
        event.preventDefault();
        actions.toggleExpanded(id);
      }
      return;
    }
    if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      // The keyboard re-order: one place up or down in the column (layout only, like a drag within it).
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
      actions.openDelete(id);
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
      data-formal={node.status.formal}
      data-selected={selected || undefined}
      data-dragging={dragging || undefined}
      data-drop-edge={dropEdge ?? undefined}
      data-provisional={provisional || undefined}
      data-highlight={flashed ? 'true' : undefined}
      data-proposed={proposed || undefined}
      data-diff={diff?.change}
      aria-label={`${KIND_NOUN[node.type]}: ${node.naturalName}${selected ? ' (selected)' : ''}${diff ? ` (${DIFF_WORD[diff.change]} in the proposal)` : ''}`}
      aria-keyshortcuts={proposed ? 'Enter' : 'Enter Space F2 Delete Alt+ArrowUp Alt+ArrowDown'}
      onClick={onClick}
      onKeyDown={onKeyDown}
      onMouseEnter={() => actions.setHover(id)}
      onMouseLeave={() => actions.setHover(null)}
    >
      {/* The diff mark on a line of its own, so the sentence keeps the whole width of the card. */}
      {diff ? (
        <div className="tl-card__diffline">
          <DiffBadge diff={diff} hideResult={hideResult} />
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
          <ChipView key={chip.key} chip={chip} onAction={proposed ? undefined : onChipAction} />
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
    </div>
  );
});
