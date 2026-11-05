/**
 * Choosing a model root for "Open Board" (D-28: multi-root workspaces get one board per opted-in root, and Open
 * Board asks which one).
 */
import * as path from 'node:path';

export type RootChoice =
  /** No model root: offer Initialize. */
  | { kind: 'none' }
  /** Exactly one: open it. */
  | { kind: 'single'; root: string }
  /** Several: ask (quick pick). */
  | { kind: 'ask'; roots: string[] };

export function chooseRoot(roots: readonly string[]): RootChoice {
  const unique = [...new Set(roots)].sort();
  if (unique.length === 0) return { kind: 'none' };
  if (unique.length === 1 && unique[0]) return { kind: 'single', root: unique[0] };
  return { kind: 'ask', roots: unique };
}

/** The root named by `wanted` (an absolute path, or a folder name that only one root has). */
export function matchRoot(roots: readonly string[], wanted: string): string | undefined {
  if (roots.includes(wanted)) return wanted;
  const resolved = path.resolve(wanted);
  if (roots.includes(resolved)) return resolved;
  const byName = roots.filter((root) => path.basename(root) === wanted);
  return byName.length === 1 ? byName[0] : undefined;
}

/** Quick-pick items for several roots: the folder name, and where it is relative to its workspace folder. */
export function rootPickItems(roots: readonly string[], workspaceFolders: readonly string[]): Array<{ label: string; description: string; root: string }> {
  return roots.map((root) => {
    const folder = workspaceFolders.find((f) => root === f || root.startsWith(`${f}${path.sep}`));
    const where = folder ? path.relative(path.dirname(folder), root) : root;
    return { label: path.basename(root), description: where.split(path.sep).join('/'), root };
  });
}

/** Workspace folders are searched for model roots up to this depth (keeps the scan cheap in large folders). */
export const ROOT_SEARCH_DEPTH = 6;
