/**
 * `.telelean/subjects/<S>/layout.json`: the column order of one subject's board (D-12; layout only, never semantics).
 * A card's column is its node's `type:`; the layout only orders cards inside a column.
 *
 * FROZEN CONTRACT (M1, docs/m1-plan.md section 7). Implemented by the architect; owned by WP-model afterwards.
 * Spec v4 (docs/slice1-plan.md 2.3): two columns, AXIOM and PROPOSITION; layouts written before v4 are read leniently
 * (ASSUMPTION -> AXIOM, DERIVATION then GOAL -> PROPOSITION); `positions` holds canvas coordinates (slice 1c).
 */
import type { NodeType } from './model.js';
import { NODE_TYPES } from './model.js';

/** A card's place on the PROPOSITIONS canvas (board coordinates, slice 1c). */
export interface CanvasPosition {
  x: number;
  y: number;
}

export interface Layout {
  format: 'telelean-layout';
  version: 1;
  /** Card order per column (ids). Ids that no longer exist, or sit in the wrong column, are ignored. */
  columns: Record<NodeType, string[]>;
  /**
   * Spec v4 BD-3: where the user placed each proposition on the canvas, by card id (slice 1c places the others).
   * Absent when no card has a stored position. Layout only: never part of a review, never an edit of the model.
   */
  positions?: Record<string, CanvasPosition>;
  /** UI state that is worth keeping with the model. */
  collapsed?: { vocabulary?: boolean };
}

/** The column keys a layout.json may use for each column: the v4 name first, then the names it had before v4. */
const COLUMN_KEYS: Readonly<Record<NodeType, readonly string[]>> = {
  AXIOM: ['AXIOM', 'ASSUMPTION'],
  PROPOSITION: ['PROPOSITION', 'DERIVATION', 'GOAL'],
};

export function emptyLayout(): Layout {
  return { format: 'telelean-layout', version: 1, columns: { AXIOM: [], PROPOSITION: [] } };
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** A position with two finite numbers, else undefined (a malformed entry is dropped, never an error). */
function positionOf(value: unknown): CanvasPosition | undefined {
  if (!isRecord(value)) return undefined;
  const { x, y } = value;
  return typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y) ? { x, y } : undefined;
}

/**
 * Parses layout.json leniently: anything malformed yields the empty layout (layout is never worth an error). A column
 * lists its v4 key's ids first, then those of the keys it had before v4 (`ASSUMPTION` for AXIOM; `DERIVATION`, then
 * `GOAL` for PROPOSITION), each id once. Malformed `positions` entries are dropped.
 */
export function parseLayout(json: string | null | undefined): Layout {
  if (!json) return emptyLayout();
  try {
    const raw = JSON.parse(json) as { columns?: unknown; positions?: unknown; collapsed?: { vocabulary?: unknown } };
    const layout = emptyLayout();
    const columns = isRecord(raw.columns) ? raw.columns : {};
    for (const kind of NODE_TYPES) {
      const seen = new Set<string>();
      for (const key of COLUMN_KEYS[kind]) {
        const ids = Object.hasOwn(columns, key) ? columns[key] : undefined;
        if (!Array.isArray(ids)) continue;
        for (const id of ids) {
          if (typeof id === 'string' && !seen.has(id)) {
            seen.add(id);
            layout.columns[kind].push(id);
          }
        }
      }
    }
    if (isRecord(raw.positions)) {
      const positions: Record<string, CanvasPosition> = {};
      for (const [id, value] of Object.entries(raw.positions)) {
        const position = positionOf(value);
        // `__proto__` would set the record's prototype instead of adding an entry.
        if (position && id !== '' && id !== '__proto__') positions[id] = position;
      }
      if (Object.keys(positions).length > 0) layout.positions = positions;
    }
    if (typeof raw.collapsed?.vocabulary === 'boolean') layout.collapsed = { vocabulary: raw.collapsed.vocabulary };
    return layout;
  } catch {
    return emptyLayout();
  }
}

/**
 * Stable serialisation (2-space indent, trailing newline), so unchanged layouts produce identical files: the columns
 * in board order, then the positions by id (each `{ x, y }`; omitted when there are none), then `collapsed`.
 */
export function serializeLayout(layout: Layout): string {
  const out: Record<string, unknown> = {
    format: 'telelean-layout',
    version: 1,
    columns: { AXIOM: layout.columns.AXIOM, PROPOSITION: layout.columns.PROPOSITION },
  };
  const ids = Object.keys(layout.positions ?? {}).sort();
  if (ids.length > 0) {
    const positions: Record<string, CanvasPosition> = {};
    for (const id of ids) {
      const position = layout.positions?.[id];
      if (position) positions[id] = { x: position.x, y: position.y };
    }
    out['positions'] = positions;
  }
  if (layout.collapsed) out['collapsed'] = layout.collapsed;
  return `${JSON.stringify(out, null, 2)}\n`;
}

/**
 * Column order for `nodes` (given in file order): ids listed in the layout's column come first, in layout order;
 * the remaining nodes of that type follow in input order.
 */
export function orderByLayout(nodes: ReadonlyArray<{ id: string; type: NodeType }>, layout?: Layout): Record<NodeType, string[]> {
  const order: Record<NodeType, string[]> = { AXIOM: [], PROPOSITION: [] };
  const typeOf = new Map(nodes.map((n) => [n.id, n.type]));
  const placed = new Set<string>();
  for (const kind of NODE_TYPES) {
    for (const id of layout?.columns[kind] ?? []) {
      if (typeOf.get(id) === kind && !placed.has(id)) {
        order[kind].push(id);
        placed.add(id);
      }
    }
  }
  for (const node of nodes) {
    if (!placed.has(node.id)) {
      order[node.type].push(node.id);
      placed.add(node.id);
    }
  }
  return order;
}

/**
 * The layout after moving `id` into `column` above `beforeId` (null = end), starting from the order the board
 * currently shows (`current`, e.g. from `orderByLayout`). The result lists every id of `current`, so the board's
 * order is pinned once the user has arranged it.
 */
export function moveInLayout(
  layout: Layout,
  current: Readonly<Record<NodeType, readonly string[]>>,
  id: string,
  column: NodeType,
  beforeId: string | null,
): Layout {
  const columns: Record<NodeType, string[]> = { AXIOM: [], PROPOSITION: [] };
  for (const kind of NODE_TYPES) columns[kind] = current[kind].filter((x) => x !== id);
  const target = columns[column];
  const index = beforeId === null ? -1 : target.indexOf(beforeId);
  if (index >= 0) target.splice(index, 0, id);
  else target.push(id);
  return { ...layout, columns };
}

/** The layout without the given ids (after deletes): out of every column, and their canvas positions dropped. */
export function withoutIds(layout: Layout, ids: Iterable<string>): Layout {
  const drop = new Set(ids);
  const columns: Record<NodeType, string[]> = { AXIOM: [], PROPOSITION: [] };
  for (const kind of NODE_TYPES) columns[kind] = layout.columns[kind].filter((id) => !drop.has(id));
  const out: Layout = { ...layout, columns };
  if (layout.positions) {
    const kept = Object.entries(layout.positions).filter(([id]) => !drop.has(id));
    if (kept.length > 0) out.positions = Object.fromEntries(kept);
    else delete out.positions;
  }
  return out;
}

/** The layout with `id` appended to `column` (after adds), unless it is already listed there (its position is kept). */
export function appendToLayout(layout: Layout, id: string, column: NodeType): Layout {
  if (layout.columns[column].includes(id)) return layout;
  const columns: Record<NodeType, string[]> = { AXIOM: [], PROPOSITION: [] };
  for (const kind of NODE_TYPES) columns[kind] = layout.columns[kind].filter((x) => x !== id);
  columns[column].push(id);
  return { ...layout, columns };
}
