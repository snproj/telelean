/**
 * `.telelean/subjects/<S>/layout.json`: the column order of one subject's board (D-12; layout only, never semantics).
 * A card's column is its node's `type:`; the layout only orders cards inside a column.
 *
 * FROZEN CONTRACT (M1, docs/m1-plan.md section 7). Implemented by the architect; owned by WP-model afterwards.
 */
import type { NodeType } from './model.js';
import { isNodeType, NODE_TYPES } from './model.js';

export interface Layout {
  format: 'telelean-layout';
  version: 1;
  /** Card order per column (ids). Ids that no longer exist, or sit in the wrong column, are ignored. */
  columns: Record<NodeType, string[]>;
  /** UI state that is worth keeping with the model. */
  collapsed?: { vocabulary?: boolean };
}

export function emptyLayout(): Layout {
  return { format: 'telelean-layout', version: 1, columns: { ASSUMPTION: [], DERIVATION: [], GOAL: [] } };
}

/** Parses layout.json leniently: anything malformed yields the empty layout (layout is never worth an error). */
export function parseLayout(json: string | null | undefined): Layout {
  if (!json) return emptyLayout();
  try {
    const raw = JSON.parse(json) as { columns?: Record<string, unknown>; collapsed?: { vocabulary?: unknown } };
    const layout = emptyLayout();
    for (const [kind, ids] of Object.entries(raw.columns ?? {})) {
      if (!isNodeType(kind) || !Array.isArray(ids)) continue;
      const seen = new Set<string>();
      for (const id of ids) {
        if (typeof id === 'string' && !seen.has(id)) {
          seen.add(id);
          layout.columns[kind].push(id);
        }
      }
    }
    if (typeof raw.collapsed?.vocabulary === 'boolean') layout.collapsed = { vocabulary: raw.collapsed.vocabulary };
    return layout;
  } catch {
    return emptyLayout();
  }
}

/** Stable serialisation (2-space indent, trailing newline), so unchanged layouts produce identical files. */
export function serializeLayout(layout: Layout): string {
  const out: Record<string, unknown> = {
    format: 'telelean-layout',
    version: 1,
    columns: { ASSUMPTION: layout.columns.ASSUMPTION, DERIVATION: layout.columns.DERIVATION, GOAL: layout.columns.GOAL },
  };
  if (layout.collapsed) out['collapsed'] = layout.collapsed;
  return `${JSON.stringify(out, null, 2)}\n`;
}

/**
 * Column order for `nodes` (given in file order): ids listed in the layout's column come first, in layout order;
 * the remaining nodes of that type follow in input order.
 */
export function orderByLayout(nodes: ReadonlyArray<{ id: string; type: NodeType }>, layout?: Layout): Record<NodeType, string[]> {
  const order: Record<NodeType, string[]> = { ASSUMPTION: [], DERIVATION: [], GOAL: [] };
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
  const columns: Record<NodeType, string[]> = { ASSUMPTION: [], DERIVATION: [], GOAL: [] };
  for (const kind of NODE_TYPES) columns[kind] = current[kind].filter((x) => x !== id);
  const target = columns[column];
  const index = beforeId === null ? -1 : target.indexOf(beforeId);
  if (index >= 0) target.splice(index, 0, id);
  else target.push(id);
  return { ...layout, columns };
}

/** The layout without the given ids (after deletes). */
export function withoutIds(layout: Layout, ids: Iterable<string>): Layout {
  const drop = new Set(ids);
  const columns: Record<NodeType, string[]> = { ASSUMPTION: [], DERIVATION: [], GOAL: [] };
  for (const kind of NODE_TYPES) columns[kind] = layout.columns[kind].filter((id) => !drop.has(id));
  return { ...layout, columns };
}

/** The layout with `id` appended to `column` (after adds), unless it is already listed there. */
export function appendToLayout(layout: Layout, id: string, column: NodeType): Layout {
  if (layout.columns[column].includes(id)) return layout;
  const base = withoutIds(layout, [id]);
  return { ...base, columns: { ...base.columns, [column]: [...base.columns[column], id] } };
}
