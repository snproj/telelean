/**
 * Drag-and-drop data shapes for @atlaskit/pragmatic-drag-and-drop (native HTML5 drag; it never moves DOM or
 * applies transforms, so the edge overlay's cached geometry stays valid during a drag).
 */
import { isNodeType, type NodeType } from '@telelean/core';
import { extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge/extract-closest-edge';
import type { Edge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/types';

const CARD = 'tl-card';
const CARD_TARGET = 'tl-card-target';
const COLUMN = 'tl-column';

export interface CardDragData {
  [key: string | symbol]: unknown;
  tl: typeof CARD;
  id: string;
}

export interface CardTargetData {
  [key: string | symbol]: unknown;
  tl: typeof CARD_TARGET;
  id: string;
}

export interface ColumnTargetData {
  [key: string | symbol]: unknown;
  tl: typeof COLUMN;
  kind: NodeType;
}

export const cardDragData = (id: string): CardDragData => ({ tl: CARD, id });
export const cardTargetData = (id: string): CardTargetData => ({ tl: CARD_TARGET, id });
export const columnTargetData = (kind: NodeType): ColumnTargetData => ({ tl: COLUMN, kind });

export const isCardDragData = (data: Record<string | symbol, unknown>): data is CardDragData =>
  data.tl === CARD && typeof data.id === 'string';
export const isCardTargetData = (data: Record<string | symbol, unknown>): data is CardTargetData =>
  data.tl === CARD_TARGET && typeof data.id === 'string';
export const isColumnTargetData = (data: Record<string | symbol, unknown>): data is ColumnTargetData =>
  data.tl === COLUMN && isNodeType(data.kind);

export interface DropTargetRecord {
  data: Record<string | symbol, unknown>;
}

/** Column under the pointer, from pragmatic-dnd's innermost-first drop target list. */
export function columnOf(targets: readonly DropTargetRecord[]): NodeType | null {
  for (const target of targets) if (isColumnTargetData(target.data)) return target.data.kind;
  return null;
}

/**
 * Where a drop lands: the column, and the card it goes above (null = end of the column).
 * Dropping on the lower half of a card inserts after it; dropping a card on itself leaves it where it is.
 */
export function dropPlacement(
  targets: readonly DropTargetRecord[],
  order: Readonly<Record<NodeType, readonly string[]>>,
  draggedId: string,
): { kind: NodeType; beforeId: string | null } | null {
  const kind = columnOf(targets);
  if (!kind) return null;
  const cardTarget = targets.find((t) => isCardTargetData(t.data));
  if (!cardTarget || !isCardTargetData(cardTarget.data)) return { kind, beforeId: null };
  const overId = cardTarget.data.id;
  if (overId === draggedId) {
    const column = order[kind];
    const index = column.indexOf(draggedId);
    return { kind, beforeId: index >= 0 ? (column[index + 1] ?? null) : null };
  }
  const edge: Edge | null = extractClosestEdge(cardTarget.data);
  if (edge !== 'bottom') return { kind, beforeId: overId };
  const column = order[kind].filter((id) => id !== draggedId);
  const next = column[column.indexOf(overId) + 1];
  return { kind, beforeId: next ?? null };
}
