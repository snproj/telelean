/**
 * Spec v4 arrows as board edits (docs/slice1-plan.md 2.4, slice 1b): `add-arrows`, `remove-arrows`,
 * `set-from-nothing`, `claim-pending` and `move-cards`. Each is one plan, so one Undo step and one History entry
 * (`move-cards` is layout only, like `reorder`).
 *
 *  - An arrow X -> Y is the entry X of Y's `premises:` (its Dependencies field, AR-4). Arrows join axiom and
 *    proposition cards of one subject, never vocabulary (AR-2).
 *  - Cycles (AR-3) are checked over the drawn arrows (the premises of propositions; an old axiom's `premises:` is not
 *    drawn, A19) and the verified edges of checked proofs: a new arrow X -> Y is refused when Y already reaches X. A
 *    cycle already in the files (TL015) blocks only the arrows that pass through it.
 *  - Into an axiom (AR-6), or marking it "follows from nothing", the same plan makes it a proposition by D-11's old
 *    A->D row: only `type:` changes (and the arrows or the mark). What it becomes depends on its `.holds`: an
 *    `axiom n.holds` stays and is pending proof; without one it is unproved; a theorem makes it proved. When established
 *    cards rest on the pending axiom, they lose their green glow: the planner asks first (`needs-confirmation`).
 *  - Arrows and the "follows from nothing" mark never coexist (AR-5): drawing an arrow removes the mark, as `set-premises`
 *    and ghost adoption do.
 *  - One Delete is one plan (AR-1, UN-2; slice 1f): `remove-arrows` also takes the selected "follows from nothing"
 *    marks, and its A16 question covers the arrows and the marks together.
 */
import { ActionError, type ArrowEnds, type BoardAction, type EditPlan } from '../actions.js';
import { arrowsInUse, glowingDependents, kindChangeImpact, removeUsedArrowsText } from '../kindChange.js';
import { moveInLayout, type CanvasPosition, type Layout } from '../layout.js';
import { edgesOf } from '../project/build.js';
import { subjectGraph } from '../project/index.js';
import type { ModelNode, ProjectModel } from '../project/types.js';
import { cutText } from '../project/text.js';
import { modelSemantic } from './planKind.js';
import { canvasPosition, currentOrder, entryOf, hasLine, label, layoutOf, pin, withoutPosition } from './planShared.js';
import { EditSession } from './session.js';
import type { PlanContext } from './types.js';

/** A card's sentence in a two-card label or message (shorter than `label`'s 60 characters). */
function nameOf(model: ProjectModel, id: string): string {
  return cutText(model.nodes.get(id)?.node.naturalName ?? id, 40);
}

const quoted = (model: ProjectModel, id: string) => `“${nameOf(model, id)}”`;

/**
 * Where arrows lead (source -> targets), for the cycle check (AR-3): the drawn arrows, i.e. the premises of
 * propositions (an old axiom's `premises:` is not drawn, A19), and the verified edges of checked proofs.
 */
function arrowGraph(model: ProjectModel): Map<string, string[]> {
  const next = new Map<string, string[]>();
  const add = (source: string, target: string) => {
    if (source === target) return;
    const list = next.get(source) ?? [];
    if (!list.includes(target)) list.push(target);
    next.set(source, list);
  };
  for (const { node } of model.nodes.values()) {
    if (node.type !== 'PROPOSITION') continue;
    for (const premise of node.premises) if (model.nodes.has(premise)) add(premise, node.id);
  }
  for (const edge of edgesOf(model).edges) if (edge.type === 'verified') add(edge.source, edge.target);
  return next;
}

/** A shortest path `from` ... `to` along the arrows, or undefined when `to` is not reachable. */
function pathBetween(next: ReadonlyMap<string, readonly string[]>, from: string, to: string): string[] | undefined {
  const parent = new Map<string, string>();
  const seen = new Set([from]);
  const queue = [from];
  while (queue.length > 0) {
    const id = queue.shift() as string;
    if (id === to) {
      const path = [to];
      for (let at = to; at !== from; ) {
        at = parent.get(at) as string;
        path.unshift(at);
      }
      return path;
    }
    for (const target of next.get(id) ?? []) {
      if (seen.has(target)) continue;
      seen.add(target);
      parent.set(target, id);
      queue.push(target);
    }
  }
  return undefined;
}

/** Refuses the first of the new arrows `sources -> target` that would close a cycle, naming it by the cards' sentences. */
function refuseCycles(model: ProjectModel, target: string, sources: readonly string[]): void {
  if (sources.length === 0) return;
  const next = arrowGraph(model);
  for (const source of sources) {
    const back = pathBetween(next, target, source);
    if (back === undefined) continue;
    const cycle = [source, ...back].map((id) => nameOf(model, id));
    throw new ActionError('invalid', `This arrow would make a cycle: ${cycle.join(' → ')}.`);
  }
}

/** A source of a new arrow: a card of the target's subject, not the target itself. */
function checkSource(model: ProjectModel, target: ModelNode, source: string): void {
  if (source === target.node.id) throw new ActionError('invalid', 'A card cannot have an arrow into itself.');
  const entry = model.nodes.get(source);
  if (!entry) {
    if (model.vocabulary.some((item) => item.name === source)) {
      throw new ActionError('invalid', `${source} is vocabulary: arrows join axioms and propositions only.`);
    }
    throw new ActionError('invalid', `No card "${source}" (it may have been deleted).`);
  }
  if (entry.node.subject !== target.node.subject) {
    throw new ActionError('invalid', `${quoted(model, source)} belongs to subject ${entry.node.subject}: arrows stay within one subject.`);
  }
}

/**
 * AR-6: what making the axiom `entry` a proposition does, from the board's graph (the same impact the board shows
 * before the gesture). Throws `needs-confirmation` when established cards rest on its pending axiom and the user has
 * not confirmed: `how` says what the gesture is ("Drawing this arrow makes …"), and the dependents are those cards.
 */
function confirmToProposition(model: ProjectModel, entry: ModelNode, confirmed: boolean, how: string): void {
  const node = entry.node;
  const graph = subjectGraph(model, node.subject, { version: 0, semantic: modelSemantic(model) });
  const impact = kindChangeImpact(graph, node.id, 'PROPOSITION');
  const glowing = glowingDependents(graph, node.id);
  if (impact.leanChange !== 'pending' || glowing.length === 0 || confirmed) return;
  throw new ActionError('needs-confirmation', `${how} ${impact.detail}`, glowing);
}

/** The layout after an axiom became a proposition: last in the propositions' order, with no stale canvas position. */
function layoutToProposition(model: ProjectModel, ctx: PlanContext, node: ModelNode['node']): { subject: string; layout: Layout } {
  const layout = layoutOf(ctx, node.subject);
  const moved = moveInLayout(layout, currentOrder(model, node.subject, layout), node.id, 'PROPOSITION', null);
  return { subject: node.subject, layout: withoutPosition(moved, node.id) };
}

export function planAddArrows(model: ProjectModel, action: Extract<BoardAction, { kind: 'add-arrows' }>, ctx: PlanContext): EditPlan {
  const entry = entryOf(model, action.target);
  const node = entry.node;
  const sources = [...new Set(action.sources)];
  if (sources.length === 0) throw new ActionError('invalid', 'Choose the card the arrow starts from.');
  for (const source of sources) checkSource(model, entry, source);
  const fresh = sources.filter((source) => !node.premises.includes(source));
  const toProposition = node.type === 'AXIOM';
  // Into an axiom, the premises it declared before v4 (not drawn, A19) become arrows too.
  refuseCycles(model, node.id, toProposition ? [...new Set([...node.premises, ...fresh])] : fresh);
  const markLine = hasLine(entry, 'follows_from');
  if (!toProposition && fresh.length === 0 && !markLine) {
    throw new ActionError('invalid', sources.length === 1 ? 'That arrow is drawn already.' : 'Those arrows are drawn already.');
  }
  const target = quoted(model, node.id);
  if (toProposition) {
    const how =
      fresh.length === 0
        ? `Its arrows from before v4 make ${target} a proposition.`
        : `Drawing ${fresh.length === 1 ? 'this arrow' : 'these arrows'} into ${target} makes it a proposition.${node.premises.length > 0 ? ' Its arrows from before v4 are drawn too.' : ''}`;
    confirmToProposition(model, entry, action.confirmed === true, how);
  }

  const session = new EditSession(model);
  if (toProposition) session.setField(entry.file, entry.block, node.id, 'type', 'PROPOSITION');
  if (fresh.length > 0) session.setField(entry.file, entry.block, node.id, 'premises', [...node.premises, ...fresh]);
  // AR-5: arrows replace the "follows from nothing" mark (both together would be TL023), as set-premises does.
  if (markLine) session.setField(entry.file, entry.block, node.id, 'follows_from', null);
  pin(session, entry);
  const into = nameOf(model, node.id);
  const text =
    fresh.length === 0
      ? `Make proposition: ${label(node.naturalName)}`
      : fresh.length === 1
        ? `Draw arrow: ${nameOf(model, fresh[0] as string)} → ${into}`
        : `Draw ${fresh.length} arrows into ${into}`;
  return {
    action: 'add-arrows',
    label: text,
    subject: node.subject,
    nodes: [node.id, ...fresh],
    changes: session.changes(),
    ...(toProposition ? { layout: layoutToProposition(model, ctx, node) } : {}),
  };
}

/** "1 arrow", "3 arrows"; "1 'follows from nothing' mark", "2 'follows from nothing' marks". */
const arrowCount = (n: number) => `${n} arrow${n === 1 ? '' : 's'}`;
const markCount = (n: number) => `${n} 'follows from nothing' mark${n === 1 ? '' : 's'}`;

/** The label of a removal of arrows only (one Delete, AR-1). */
function removeArrowsLabel(model: ProjectModel, arrows: readonly ArrowEnds[], groups: ReadonlyArray<{ entry: ModelNode }>): string {
  const first = arrows[0] as ArrowEnds;
  const only = groups.length === 1 ? (groups[0] as { entry: ModelNode }).entry.node : undefined;
  if (only?.type === 'AXIOM') return `Drop arrows declared before v4: ${label(only.naturalName)}`;
  if (arrows.length === 1) return `Remove arrow: ${nameOf(model, first.source)} → ${nameOf(model, first.target)}`;
  return only ? `Remove ${arrows.length} arrows into ${nameOf(model, only.id)}` : `Remove ${arrows.length} arrows into ${groups.length} cards`;
}

export function planRemoveArrows(model: ProjectModel, action: Extract<BoardAction, { kind: 'remove-arrows' }>): EditPlan {
  const seen = new Set<string>();
  const arrows: ArrowEnds[] = [];
  for (const arrow of action.arrows) {
    const key = `${arrow.source}\u0000${arrow.target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    arrows.push({ source: arrow.source, target: arrow.target });
  }
  // Slice 1f (carry-over 2): the "follows from nothing" marks removed by the same Delete (one plan, one Undo step).
  const markIds = [...new Set(action.marks ?? [])];
  if (arrows.length === 0 && markIds.length === 0) throw new ActionError('invalid', 'Choose the arrows to remove.');
  /** The sources to remove, by target, in the order the arrows were given. */
  const byTarget = new Map<string, { entry: ModelNode; sources: Set<string> }>();
  for (const { source, target } of arrows) {
    const entry = entryOf(model, target);
    if (source === target) throw new ActionError('invalid', 'A card cannot have an arrow into itself.');
    if (!entry.node.premises.includes(source)) {
      throw new ActionError('invalid', `There is no arrow from ${model.nodes.has(source) ? quoted(model, source) : `"${source}"`} into ${quoted(model, target)} (any more).`);
    }
    const group = byTarget.get(target) ?? { entry, sources: new Set<string>() };
    group.sources.add(source);
    byTarget.set(target, group);
  }
  const marks = markIds.map((id) => {
    const entry = entryOf(model, id);
    if (!hasLine(entry, 'follows_from')) throw new ActionError('invalid', `${quoted(model, id)} is not marked "follows from nothing" (any more).`);
    return entry;
  });
  const groups = [...byTarget.values()];
  const subject = (groups[0]?.entry ?? (marks[0] as ModelNode)).node.subject;
  if ([...groups.map((g) => g.entry), ...marks].some((entry) => entry.node.subject !== subject)) {
    throw new ActionError('invalid', 'Remove the arrows of one subject at a time.');
  }
  // A16: a proof that uses a removed arrow still builds, but its use is then undeclared (TL107) and its band loses ✓.
  // The question covers the whole removal: nothing is removed unless it is confirmed (marks included).
  const used = arrowsInUse({ edges: edgesOf(model).edges }, arrows);
  if (used.length > 0 && action.confirmed !== true) {
    throw new ActionError('needs-confirmation', removeUsedArrowsText(used, (id) => nameOf(model, id)), [...new Set(used.map((a) => a.target))]);
  }

  const session = new EditSession(model);
  const pinned = new Set<string>();
  for (const { entry, sources } of groups) {
    const kept = entry.node.premises.filter((premise) => !sources.has(premise));
    session.setField(entry.file, entry.block, entry.node.id, 'premises', kept.length > 0 ? kept : null);
    pin(session, entry);
    pinned.add(entry.node.id);
  }
  for (const entry of marks) {
    session.setField(entry.file, entry.block, entry.node.id, 'follows_from', null);
    if (!pinned.has(entry.node.id)) pin(session, entry);
    pinned.add(entry.node.id);
  }
  const only = marks.length === 1 ? (marks[0] as ModelNode).node : undefined;
  const text =
    marks.length === 0
      ? removeArrowsLabel(model, arrows, groups)
      : arrows.length > 0
        ? `Remove ${arrowCount(arrows.length)} and ${markCount(marks.length)}`
        : only
          ? `Remove 'follows from nothing': ${label(only.naturalName)}`
          : `Remove ${markCount(marks.length)}`;
  const nodes = [...new Set([...groups.map((g) => g.entry.node.id), ...marks.map((m) => m.node.id), ...arrows.map((a) => a.source)])];
  return { action: 'remove-arrows', label: text, subject, nodes, changes: session.changes() };
}

export function planSetFromNothing(model: ProjectModel, action: Extract<BoardAction, { kind: 'set-from-nothing' }>, ctx: PlanContext): EditPlan {
  const entry = entryOf(model, action.id);
  const node = entry.node;
  const session = new EditSession(model);
  if (!action.on) {
    if (!hasLine(entry, 'follows_from')) throw new ActionError('invalid', 'It is not marked "follows from nothing".');
    session.setField(entry.file, entry.block, node.id, 'follows_from', null);
    pin(session, entry);
    return { action: 'set-from-nothing', label: `Remove 'follows from nothing': ${label(node.naturalName)}`, subject: node.subject, nodes: [node.id], changes: session.changes() };
  }
  const toProposition = node.type === 'AXIOM';
  if (node.premises.length > 0) {
    throw new ActionError(
      'invalid',
      toProposition
        ? 'It declares arrows from before v4: make it a proposition with them, or drop them first.'
        : 'It has arrows into it: a card follows from nothing only without them. Remove its arrows first.',
    );
  }
  if (!toProposition && node.fromNothing === true) throw new ActionError('invalid', 'It is marked "follows from nothing" already.');
  if (toProposition) confirmToProposition(model, entry, action.confirmed === true, `Marking ${quoted(model, node.id)} "follows from nothing" makes it a proposition.`);
  if (toProposition) session.setField(entry.file, entry.block, node.id, 'type', 'PROPOSITION');
  session.setField(entry.file, entry.block, node.id, 'follows_from', 'nothing');
  pin(session, entry);
  return {
    action: 'set-from-nothing',
    label: `Follows from nothing: ${label(node.naturalName)}`,
    subject: node.subject,
    nodes: [node.id],
    changes: session.changes(),
    ...(toProposition ? { layout: layoutToProposition(model, ctx, node) } : {}),
  };
}

/** Statement not found (TL101) or not a Prop abbrev/def (TL113). */
function bindingBroken(model: ProjectModel, id: string): boolean {
  return model.diagnostics.some((d) => d.nodeId === id && (d.code === 'TL101' || d.code === 'TL113'));
}

export function planClaimPending(model: ProjectModel, action: Extract<BoardAction, { kind: 'claim-pending' }>): EditPlan {
  const entry = entryOf(model, action.id);
  const node = entry.node;
  const statement = node.lean.statement;
  if (node.type !== 'PROPOSITION') throw new ActionError('invalid', 'Only a proposition can be marked pending: an axiom is assumed already.');
  if (!statement || !entry.statementDecl || node.status.formal === 'informal') {
    throw new ActionError('invalid', 'It has no Lean statement yet: formalize it before marking it pending.');
  }
  if (node.status.formal !== 'formalized' || bindingBroken(model, node.id)) {
    throw new ActionError('invalid', 'Its Lean statement has a problem (see its Problems): fix it before marking it pending.');
  }
  if (entry.holdsDecl !== undefined || node.lean.justification !== undefined) {
    throw new ActionError('invalid', node.lean.justificationKind === 'axiom' ? 'It is pending proof already.' : 'It has a proof already: there is nothing to mark.');
  }
  const session = new EditSession(model);
  session.leanOps(entry.statementDecl.file, [{ op: 'add-holds-axiom', statement }]);
  return { action: 'claim-pending', label: `Mark pending: ${label(node.naturalName)}`, subject: node.subject, nodes: [node.id], changes: session.changes() };
}

export function planMoveCards(model: ProjectModel, action: Extract<BoardAction, { kind: 'move-cards' }>, ctx: PlanContext): EditPlan {
  const moves = Object.entries(action.positions);
  if (moves.length === 0) throw new ActionError('invalid', 'Choose the cards to move.');
  const moved: Array<[string, CanvasPosition]> = [];
  let subject: string | undefined;
  for (const [id, position] of moves) {
    if (id === '__proto__') throw new ActionError('invalid', `No card "${id}".`);
    const node = entryOf(model, id).node;
    if (node.type !== 'PROPOSITION') throw new ActionError('invalid', 'Only propositions have a place on the canvas: the axioms keep their column order.');
    subject ??= node.subject;
    if (node.subject !== subject) throw new ActionError('invalid', 'Move the cards of one subject at a time.');
    moved.push([id, canvasPosition(position)]);
  }
  const layout = layoutOf(ctx, subject as string);
  const positions: Record<string, CanvasPosition> = Object.fromEntries([...Object.entries(layout.positions ?? {}).filter(([id]) => !Object.hasOwn(action.positions, id)), ...moved]);
  const first = moved[0] as [string, CanvasPosition];
  return {
    action: 'move-cards',
    label: moved.length === 1 ? `Move: ${label(entryOf(model, first[0]).node.naturalName)}` : `Move: ${moved.length} cards`,
    subject: subject as string,
    nodes: moved.map(([id]) => id),
    changes: [],
    layout: { subject: subject as string, layout: { ...layout, positions } },
    layoutOnly: true,
  };
}
