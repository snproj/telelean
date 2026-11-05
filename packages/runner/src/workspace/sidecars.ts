/**
 * Turning an EditPlan's sidecars into whole-file FileChanges (docs/m1-plan.md sections 2 and 7.1):
 *
 *   plan.layout   -> `.telelean/subjects/<S>/layout.json` (serializeLayout)
 *   plan.archive  -> `.telelean/subjects/<S>/attic/<id>.lean`, each entry appended as
 *                      -- archived <ISO time> (<reason>): <declName>
 *                      <the declaration's text, verbatim>
 *                    with a blank line between entries.
 */
import { ActionError, atticPath, layoutPath, serializeLayout, type ArchiveEntry, type EditPlan, type FileChange } from '@telelean/core';

import { assertRelativePath } from './files.js';

/** The attic text after appending `entries` (archived at `nowIso`) to `before` (null: a new file). */
export function appendToAttic(before: string | null, entries: readonly ArchiveEntry[], nowIso: string): string {
  const oneLine = (s: string): string => s.replace(/[\r\n]+/g, ' ').trim();
  const blocks = entries.map((entry) => {
    const text = entry.text.endsWith('\n') ? entry.text : `${entry.text}\n`;
    return `-- archived ${nowIso} (${oneLine(entry.reason)}): ${oneLine(entry.declName)}\n${text}`;
  });
  const appendix = blocks.join('\n');
  if (before === null || before === '') return appendix;
  return `${before.endsWith('\n') ? before : `${before}\n`}\n${appendix}`;
}

/**
 * The plan's Lean changes followed by its sidecar changes, as whole files; unchanged files are dropped. Throws
 * ActionError `internal` when the plan changes one path twice or names a path outside the root.
 */
export async function materialisePlan(plan: EditPlan, read: (path: string) => Promise<string | null>, nowIso: string): Promise<FileChange[]> {
  const out: FileChange[] = [];
  const seen = new Set<string>();
  const add = (change: FileChange): void => {
    try {
      assertRelativePath(change.path);
    } catch (error) {
      throw new ActionError('internal', (error as Error).message);
    }
    if (seen.has(change.path)) throw new ActionError('internal', `the plan changes ${change.path} twice`);
    seen.add(change.path);
    if (change.before !== change.after) out.push({ path: change.path, before: change.before, after: change.after });
  };
  for (const change of plan.changes) add(change);
  if (plan.layout) {
    const rel = layoutPath(plan.layout.subject);
    add({ path: rel, before: await read(rel), after: serializeLayout(plan.layout.layout) });
  }
  const bySidecar = new Map<string, ArchiveEntry[]>();
  for (const entry of plan.archive ?? []) {
    const rel = atticPath(entry.subject, entry.nodeId);
    bySidecar.set(rel, [...(bySidecar.get(rel) ?? []), entry]);
  }
  for (const [rel, entries] of bySidecar) {
    const before = await read(rel);
    add({ path: rel, before, after: appendToAttic(before, entries, nowIso) });
  }
  return out;
}
