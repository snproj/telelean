/**
 * telelean's deterministic normalisation before every gate (docs/m2-plan.md section 3.4) and the confirmed lifecycle
 * items of a proposal (D-21). Both go through WP-markup's primitives via the edit session, so every byte outside the
 * edited lines stays as it was.
 */
import { ActionError, type FileChange } from '../actions.js';
import { EditSession } from '../edit/session.js';
import { setBlockFields } from '../markup/edits.js';
import { escapeBodyText } from '../markup/values.js';
import type { ProjectModel } from '../project/types.js';
import type { LifecycleItem } from '../run.js';

/** See `normalisationChanges` in ./index.ts. */
export function normalisation(model: ProjectModel, nodeIds: readonly string[]): FileChange[] {
  const session = new EditSession(model);
  for (const id of [...new Set(nodeIds)]) {
    const entry = model.nodes.get(id);
    if (!entry || !entry.statementDecl) continue;
    const node = entry.node;
    const statement = node.lean.statement;
    if (statement === undefined || node.lean.binding === 'none') continue;
    // Only a well-formed statement (found, a Prop abbrev/def) is pinned and mirrored.
    if (model.diagnostics.some((d) => d.nodeId === id && (d.code === 'TL101' || d.code === 'TL113'))) continue;
    // D-8 pin (with the derived id written back, TL112, as every block edit does), or just the id.
    if (node.lean.binding === 'adjacent') session.setField(entry.file, entry.block, id, 'lean', [statement]);
    else if (!entry.block.idWritten) session.setField(entry.file, entry.block, id, 'id', id);
    // D-9 docstring mirror.
    const sentence = node.naturalName.trim();
    if (sentence === '') continue;
    if (entry.statementDecl.decl.docstring !== escapeBodyText(sentence).trim()) {
      session.leanOps(entry.statementDecl.file, [{ op: 'set-docstring', decl: statement, text: sentence }]);
    }
  }
  return session.changes();
}

/** See `lifecycleChanges` in ./index.ts. */
export function lifecycle(model: ProjectModel, items: readonly LifecycleItem[]): FileChange[] {
  const session = new EditSession(model);
  for (const item of items) {
    const entry = model.nodes.get(item.nodeId);
    if (item.kind !== 'change-kind') throw new ActionError('unsafe', `Unknown lifecycle item ${JSON.stringify(item.kind)}.`);
    if (!entry) throw new ActionError('unsafe', `The card "${item.nodeId}" no longer exists, so "${item.reason}" no longer applies.`);
    const node = entry.node;
    if (item.from !== 'GOAL' || item.to !== 'DERIVATION') {
      throw new ActionError('unsafe', `Only "Make Derivation" of a proved goal is applied with a proposal (got ${item.from} → ${item.to}).`);
    }
    if (node.type !== item.from) throw new ActionError('unsafe', `"${node.naturalName}" is no longer a goal (it is a ${node.type.toLowerCase()}), so it cannot be made a derivation now.`);
    if (node.status.proof.kind !== 'proved') throw new ActionError('unsafe', `"${node.naturalName}" is no longer proved, so it cannot be made a derivation now.`);
    // Only the `type:` line (06.2: "type only (already proved)"); no pin, no id line.
    const block = session.block(entry.file, entry.block);
    session.apply(entry.file, setBlockFields(session.parsed(entry.file), { ...block, idWritten: true }, [{ key: 'type', value: item.to }]));
  }
  return session.changes();
}
