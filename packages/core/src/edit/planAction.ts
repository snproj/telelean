/**
 * Planning board actions (docs/m1-plan.md section 6.2, D-18): from a BoardAction and the project model to an EditPlan
 * with whole-file Lean changes, the subject's new layout and archived declarations. Every block edit goes through
 * WP-markup's primitives (unrelated text untouched byte for byte). Every plan that edits a block also writes its
 * derived id (`id:`) and, for a node formalised by adjacency, its pinned binding (`lean:`, D-8).
 */
import { ActionError, type ArchiveEntry, type BoardAction, type EditableField, type EditPlan } from '../actions.js';
import { holdsName } from '../facts.js';
import { emptyLayout, moveInLayout, withoutIds } from '../layout.js';
import type { KnownFieldKey, LeanOp } from '../markup/types.js';
import { deriveId, escapeBodyText, renderBlock } from '../markup/api.js';
import { EVIDENTIALS, STANCES, type Evidential, type Stance } from '../model.js';
import { inboxPath, isSubjectName, libraryRootFile, subjectDir, subjectRootFile } from '../paths.js';
import type { ProjectModel } from '../project/types.js';
import { planDel } from './planDelete.js';
import { NOUN, planKind } from './planKind.js';
import { AXIOM_TO_PROPOSITION_REFUSAL } from '../kindChange.js';
import { planAddArrows, planClaimPending, planMoveCards, planRemoveArrows, planSetFromNothing } from './planArrows.js';
import { canvasPosition, currentOrder, entryOf, label, layoutOf, pin, withoutPosition } from './planShared.js';
import { EditSession } from './session.js';
import type { PlanContext } from './types.js';
import { subjectScaffold } from './scaffold.js';

const FIELD_KEY: Readonly<Record<EditableField, KnownFieldKey>> = { naturalName: 'natural_name', rationale: 'rationale', stance: 'stance', source: 'source' };

function sentence(value: string | null | undefined): string {
  const text = (value ?? '').trim();
  if (!text) throw new ActionError('invalid', 'The sentence is empty.');
  if (/[\r\n]/.test(text)) throw new ActionError('invalid', 'A sentence is one line.');
  return text;
}

function archiveEntries(subject: string, nodeId: string, reason: string, archived: ReadonlyArray<{ name: string; text: string }>): ArchiveEntry[] {
  return archived.map((a) => ({ subject, nodeId, declName: a.name, text: a.text, reason }));
}

function planAddNode(model: ProjectModel, action: Extract<BoardAction, { kind: 'add-node' }>, ctx: PlanContext): EditPlan {
  const subject = action.subject;
  if (!model.subjects.some((s) => s.name === subject)) throw new ActionError('not-found', `No subject "${subject}".`);
  const text = sentence(action.naturalName);
  if (action.stance !== undefined && !STANCES.includes(action.stance)) throw new ActionError('invalid', `Unknown stance "${action.stance}".`);
  if (action.source !== undefined && !EVIDENTIALS.includes(action.source)) throw new ActionError('invalid', `Unknown source "${action.source}".`);
  const taken = new Set<string>(model.nodes.keys());
  for (const file of model.files.values()) for (const block of file.blocks) taken.add(block.id);
  const id = deriveId(text, (candidate) => taken.has(candidate));

  const library = model.library;
  const session = new EditSession(model);
  const inbox = inboxPath(subject, library);
  if (!session.exists(inbox)) {
    const scaffold = subjectScaffold(subject, library).find((f) => f.path === inbox);
    session.create(inbox, scaffold?.text ?? '');
    const subjectRoot = subjectRootFile(subject, library);
    session.addImport(session.exists(subjectRoot) ? subjectRoot : libraryRootFile(library), `${library}.${subject}.Inbox`);
  }
  const rationale = action.rationale?.trim();
  const blockText = renderBlock(
    {
      id,
      type: action.type,
      naturalName: text,
      ...(rationale ? { rationale } : {}),
      ...(action.stance ? { stance: action.stance } : {}),
      ...(action.source ? { source: action.source } : {}),
      asserted: ctx.today,
    },
    session.parsed(inbox).eol,
  );
  session.insertBlock(inbox, blockText, { kind: 'end-of-namespace', namespace: subject });
  const layout = layoutOf(ctx, subject);
  const ordered = moveInLayout(layout, currentOrder(model, subject, layout), id, action.type, null);
  // Spec v4 BD-3, BD-8, CM-7 (slice 1c): a proposition's place on the canvas, written with the card (one Undo step).
  const position = action.position !== undefined && action.type === 'PROPOSITION' ? canvasPosition(action.position) : undefined;
  return {
    action: 'add-node',
    label: `Add ${NOUN[action.type].toLowerCase()}: ${label(text)}`,
    subject,
    nodes: [id],
    changes: session.changes(),
    layout: { subject, layout: position ? { ...ordered, positions: { ...(ordered.positions ?? {}), [id]: position } } : ordered },
    nodeId: id,
  };
}

function planEditNode(model: ProjectModel, action: Extract<BoardAction, { kind: 'edit-node' }>): EditPlan {
  const entry = entryOf(model, action.id);
  const node = entry.node;
  let value: string | null;
  switch (action.field) {
    case 'naturalName':
      value = sentence(action.value);
      break;
    case 'rationale':
      value = action.value === null || action.value.trim() === '' ? null : action.value.trim();
      break;
    case 'stance':
      if (action.value !== null && !STANCES.includes(action.value as Stance)) throw new ActionError('invalid', `Unknown stance "${action.value}".`);
      value = action.value;
      break;
    case 'source':
      if (action.value !== null && !EVIDENTIALS.includes(action.value as Evidential)) throw new ActionError('invalid', `Unknown source "${action.value}".`);
      value = action.value;
      break;
    default:
      throw new ActionError('invalid', 'This field cannot be edited on the board.');
  }
  const session = new EditSession(model);
  // D-9 docstring mirror: follow the sentence when the statement's docstring is the old sentence.
  if (action.field === 'naturalName' && value !== null && entry.statementDecl && node.lean.statement) {
    const docstring = entry.statementDecl.decl.docstring?.trim();
    if (docstring !== undefined && docstring === escapeBodyText(node.naturalName).trim()) {
      session.leanOps(entry.statementDecl.file, [{ op: 'set-docstring', decl: node.lean.statement, text: value }]);
    }
  }
  session.setField(entry.file, entry.block, node.id, FIELD_KEY[action.field], value);
  pin(session, entry);
  const shown = action.field === 'naturalName' && value !== null ? value : node.naturalName;
  const text =
    action.field === 'naturalName'
      ? `Edit sentence: ${label(shown)}`
      : action.field === 'rationale'
        ? `Edit why: ${label(shown)}`
        : `Set ${action.field}: ${value ?? 'none'} (${label(shown)})`;
  return { action: 'edit-node', label: text, subject: node.subject, nodes: [node.id], changes: session.changes() };
}

/**
 * The confirmation list for a delete that breaks other declarations: the cards owning them (node ids), then the
 * fully-qualified names of untracked declarations, as for kind changes (docs/m1-plan.md 6.2, D-18).
 */
function deleteDependents(model: ProjectModel, nodeId: string, broken: readonly string[]): string[] {
  const out: string[] = [];
  for (const name of broken) {
    const owner = model.ownerOfDecl.get(name);
    if (owner !== undefined && owner !== nodeId && !out.includes(owner)) out.push(owner);
  }
  for (const name of broken) if (model.ownerOfDecl.get(name) === undefined && !out.includes(name)) out.push(name);
  return out;
}

function planDeleteNode(model: ProjectModel, action: Extract<BoardAction, { kind: 'delete-node' }>, ctx: PlanContext): EditPlan {
  const entry = entryOf(model, action.id);
  const node = entry.node;
  // Slice 2i (spec v4 S9, ES-9): the card's Lean always goes with it; "Delete anyway" (confirmed) still deletes a card
  // whose Lean other declarations use.
  const del = planDel(model, { id: node.id });
  if (del.brokenDependents.length > 0 && action.confirmed !== true) {
    const dependents = deleteDependents(model, node.id, del.brokenDependents);
    const shown = dependents.map((d) => model.nodes.get(d)?.node.naturalName ?? d);
    const list = shown.length > 3 ? `${shown.slice(0, 3).join('; ')}; … (${shown.length - 3} more)` : shown.join('; ');
    throw new ActionError(
      'needs-confirmation',
      dependents.length === 1
        ? `Deleting its Lean code breaks a declaration that uses it (${list}), which stops compiling. Delete anyway, or cancel.`
        : `Deleting its Lean code breaks ${dependents.length} declarations that use it (${list}): they stop compiling. Delete anyway, or cancel.`,
      dependents,
    );
  }
  const session = new EditSession(model);
  const archive: ArchiveEntry[] = [];
  if (node.lean.statement && del.removeDecls.length > 0) {
    const statement = node.lean.statement;
    const ops = new Map<string, LeanOp[]>();
    const add = (file: string, op: LeanOp) => ops.set(file, [...(ops.get(file) ?? []), op]);
    const statementFile = entry.statementDecl?.file ?? model.declFacts.get(statement)?.file;
    if (statementFile) add(statementFile, { op: 'remove-decl', name: statement, archive: false });
    if (del.removeDecls.includes(holdsName(statement))) {
      const holdsFile = entry.holdsDecl?.file ?? model.declFacts.get(holdsName(statement))?.file;
      if (holdsFile) add(holdsFile, { op: 'remove-holds', statement, archive: node.lean.justificationKind !== 'axiom' });
    }
    for (const file of [...ops.keys()].sort()) archive.push(...archiveEntries(node.subject, node.id, 'deleted', session.leanOps(file, ops.get(file) ?? [])));
  }
  session.removeBlock(entry.file, entry.block);
  for (const id of del.premiseRemovals) {
    const other = entryOf(model, id);
    const premises = other.node.premises.filter((p) => p !== node.id);
    session.setField(other.file, other.block, other.node.id, 'premises', premises.length > 0 ? premises : null);
    pin(session, other);
  }
  return {
    action: 'delete-node',
    label: `Delete: ${label(node.naturalName)}`,
    subject: node.subject,
    nodes: [node.id, ...del.premiseRemovals],
    changes: session.changes(),
    layout: { subject: node.subject, layout: withoutIds(layoutOf(ctx, node.subject), [node.id]) },
    ...(archive.length > 0 ? { archive } : {}),
  };
}

function planChangeKind(model: ProjectModel, action: Extract<BoardAction, { kind: 'change-kind' }>, ctx: PlanContext): EditPlan {
  const entry = entryOf(model, action.id);
  const node = entry.node;
  const plan = planKind(model, {
    id: node.id,
    to: action.to,
    ...(action.dependents ? { dependents: action.dependents } : {}),
    ...(action.confirmedDependents ? { confirmedDependents: action.confirmedDependents } : {}),
  });
  const session = new EditSession(model);
  const archive: ArchiveEntry[] = [];
  const reason = `${NOUN[plan.from]} -> ${NOUN[plan.to]}`;
  for (const group of plan.leanOps) archive.push(...archiveEntries(node.subject, node.id, reason, session.leanOps(group.file, group.ops)));
  const fields = [...plan.fieldChanges];
  const rationale = action.rationale?.trim();
  if (action.to === 'AXIOM' && rationale) fields.push({ key: 'rationale', value: rationale });
  for (const change of fields) session.setField(entry.file, entry.block, node.id, change.key, change.value);
  pin(session, entry);
  const layout = layoutOf(ctx, node.subject);
  const rewrote = plan.leanOps.some((g) => g.ops.some((op) => op.op === 'add-hypothesis' || op.op === 'drop-arguments'));
  const suffix = action.dependents === 'rewrite' && rewrote ? ' (dependents rewritten)' : action.dependents === 'mark-broken' && plan.broken.length > 0 ? ' (dependents marked broken)' : '';
  return {
    action: 'change-kind',
    // Slice 1f (carry-over 4): the only kind change left is "Move to axioms" (AR-7), and its Undo and History label say so.
    label: `${action.to === 'AXIOM' ? 'Move to axioms' : `Make ${NOUN[action.to]}`}: ${label(node.naturalName)}${suffix}`,
    subject: node.subject,
    nodes: [node.id],
    changes: session.changes(),
    layout: { subject: node.subject, layout: withoutPosition(moveInLayout(layout, currentOrder(model, node.subject, layout), node.id, action.to, action.beforeId), node.id) },
    ...(archive.length > 0 ? { archive } : {}),
  };
}

function planReorder(model: ProjectModel, action: Extract<BoardAction, { kind: 'reorder' }>, ctx: PlanContext): EditPlan {
  const entry = entryOf(model, action.id);
  const node = entry.node;
  if (action.column !== node.type) {
    throw new ActionError(
      'invalid',
      action.column === 'AXIOM' ? 'Moving a card to the Axioms column changes its kind: drop it on the "Move to axioms" zone.' : AXIOM_TO_PROPOSITION_REFUSAL,
    );
  }
  if (action.beforeId === node.id) throw new ActionError('invalid', 'A card cannot be placed before itself.');
  const layout = layoutOf(ctx, node.subject);
  return {
    action: 'reorder',
    label: `Move: ${label(node.naturalName)}`,
    subject: node.subject,
    nodes: [node.id],
    changes: [],
    layout: { subject: node.subject, layout: moveInLayout(layout, currentOrder(model, node.subject, layout), node.id, action.column, action.beforeId) },
    layoutOnly: true,
  };
}

function planSetPremises(model: ProjectModel, action: Extract<BoardAction, { kind: 'set-premises' }>): EditPlan {
  const entry = entryOf(model, action.target);
  const node = entry.node;
  const premises = [...new Set(action.premises)];
  if (premises.length === 0) throw new ActionError('not-yet', 'Self-evident? arrives with Claude in M2');
  for (const id of premises) {
    if (id === node.id) throw new ActionError('invalid', 'A card cannot support itself.');
    const premise = model.nodes.get(id);
    if (!premise) throw new ActionError('invalid', `No card "${id}".`);
    if (premise.node.subject !== node.subject) throw new ActionError('invalid', `"${id}" belongs to subject ${premise.node.subject}: premises stay within one subject.`);
  }
  // No premise cycle: the target must not support (transitively) any of its new premises.
  const premisesOf = (id: string) => (id === node.id ? premises : (model.nodes.get(id)?.node.premises ?? []));
  const seen = new Set<string>();
  const stack = [...premises];
  while (stack.length > 0) {
    const id = stack.pop() as string;
    if (id === node.id) throw new ActionError('invalid', 'These premises would make a cycle: a card would (indirectly) support itself.');
    if (seen.has(id)) continue;
    seen.add(id);
    stack.push(...premisesOf(id));
  }
  const session = new EditSession(model);
  session.setField(entry.file, entry.block, node.id, 'premises', premises);
  // Spec v4 AR-5: arrows into the card replace its "follows from nothing" mark (both together would be TL023).
  if (entry.block.lines.some((line) => line.key === 'follows_from')) session.setField(entry.file, entry.block, node.id, 'follows_from', null);
  pin(session, entry);
  return {
    action: 'set-premises',
    label: `These suffice: ${label(node.naturalName)} ← ${premises.length} premise${premises.length === 1 ? '' : 's'}`,
    subject: node.subject,
    nodes: [node.id, ...premises],
    changes: session.changes(),
  };
}

function planCreateSubject(model: ProjectModel, action: Extract<BoardAction, { kind: 'create-subject' }>): EditPlan {
  const name = action.name;
  const library = model.library;
  if (!isSubjectName(name)) throw new ActionError('invalid', `"${name}" is not a subject name: use a capitalised Lean identifier (letters, digits, "_").`);
  const dir = `${subjectDir(name, library)}/`;
  if (model.subjects.some((s) => s.name === name) || [...model.files.keys()].some((p) => p === subjectRootFile(name, library) || p.startsWith(dir))) {
    throw new ActionError('invalid', `A subject named ${name} exists already.`);
  }
  const session = new EditSession(model);
  for (const file of subjectScaffold(name, library)) session.create(file.path, file.text);
  session.addImport(libraryRootFile(library), `${library}.${name}`);
  return { action: 'create-subject', label: `New subject: ${name}`, subject: name, nodes: [], changes: session.changes(), layout: { subject: name, layout: emptyLayout() } };
}

export function plan(model: ProjectModel, action: BoardAction, ctx: PlanContext): EditPlan {
  switch (action.kind) {
    case 'add-node':
      return planAddNode(model, action, ctx);
    case 'edit-node':
      return planEditNode(model, action);
    case 'delete-node':
      return planDeleteNode(model, action, ctx);
    case 'change-kind':
      return planChangeKind(model, action, ctx);
    case 'reorder':
      return planReorder(model, action, ctx);
    case 'set-premises':
      return planSetPremises(model, action);
    case 'create-subject':
      return planCreateSubject(model, action);
    case 'add-arrows':
      return planAddArrows(model, action, ctx);
    case 'remove-arrows':
      return planRemoveArrows(model, action);
    case 'set-from-nothing':
      return planSetFromNothing(model, action, ctx);
    case 'claim-pending':
      return planClaimPending(model, action);
    case 'move-cards':
      return planMoveCards(model, action, ctx);
    default: {
      const never: never = action;
      throw new ActionError('invalid', `Unknown action ${(never as { kind: string }).kind}.`);
    }
  }
}

