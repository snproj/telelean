/**
 * Helpers the planners share (./planAction.ts, ./planArrows.ts): card lookup, the board's column order, the D-8
 * binding pin, labels and the canvas positions of a layout.
 */
import { ActionError } from '../actions.js';
import { emptyLayout, orderByLayout, type CanvasPosition, type Layout } from '../layout.js';
import type { ModelNode, ProjectModel } from '../project/types.js';
import { cutText } from '../project/text.js';
import { LIMITS } from '../protocol.js';
import type { EditSession } from './session.js';
import type { PlanContext } from './types.js';

/** One line of a label (history dropdown, Undo toast). */
export const label = (text: string, max = 60) => cutText(text, max);

export function entryOf(model: ProjectModel, id: string): ModelNode {
  const entry = model.nodes.get(id);
  if (!entry) throw new ActionError('not-found', `No card "${id}" (it may have been deleted).`);
  return entry;
}

export function layoutOf(ctx: PlanContext, subject: string): Layout {
  return ctx.layouts[subject] ?? emptyLayout();
}

/** The subject's column order as the board shows it (layout first, then file order). */
export function currentOrder(model: ProjectModel, subject: string, layout: Layout) {
  const nodes = [...model.nodes.values()].map((e) => e.node).filter((n) => n.subject === subject);
  return orderByLayout(nodes, layout);
}

/** D-8: whenever telelean edits the block of a node formalised by adjacency, it pins the binding. */
export function pin(session: EditSession, entry: ModelNode): void {
  const node = entry.node;
  if (node.lean.binding === 'adjacent' && node.status.formal === 'formalized' && node.lean.statement) {
    session.setField(entry.file, entry.block, node.id, 'lean', [node.lean.statement]);
  }
}

/**
 * The layout without `id`'s canvas position (its column order unchanged). P->A takes a card off the canvas (AR-7): a
 * stale position must not bring it back to its old place when it becomes a proposition again (AR-6 places it next to
 * its new source).
 */
export function withoutPosition(layout: Layout, id: string): Layout {
  if (layout.positions === undefined || !Object.hasOwn(layout.positions, id)) return layout;
  const kept = Object.entries(layout.positions).filter(([key]) => key !== id);
  const out: Layout = { ...layout };
  if (kept.length > 0) out.positions = Object.fromEntries(kept);
  else delete out.positions;
  return out;
}

/** True when the block has a line for `key` (written by hand or by telelean; valid or not). */
export function hasLine(entry: ModelNode, key: string): boolean {
  return entry.block.lines.some((line) => line.key === key);
}

/** A canvas coordinate within the protocol's bounds (`LIMITS.coordinate`), else `invalid`. */
export function coordinate(value: number): number {
  const max = LIMITS.coordinate;
  if (!Number.isFinite(value) || Math.abs(value) > max) throw new ActionError('invalid', `A position on the canvas must be a number from -${max} to ${max}.`);
  return value;
}

/** A position on the canvas with both coordinates checked (`move-cards`, and `add-node`'s position, slice 1c). */
export function canvasPosition(position: CanvasPosition): CanvasPosition {
  return { x: coordinate(position.x), y: coordinate(position.y) };
}
