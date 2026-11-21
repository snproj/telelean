/**
 * telelean's deterministic normalisation before every gate (docs/m2-plan.md section 3.4). It goes through WP-markup's
 * primitives via the edit session, so every byte outside the edited lines stays as it was. (The confirmed lifecycle
 * items of a proposal, a proved GOAL made a DERIVATION, went with spec v4's two kinds: docs/slice1-plan.md 2.6.)
 */
import type { FileChange } from '../actions.js';
import { EditSession } from '../edit/session.js';
import { escapeBodyText } from '../markup/values.js';
import type { ProjectModel } from '../project/types.js';

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
