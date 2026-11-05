/**
 * Where a board opens files and history previews (vscode-free, unit-tested): never in the board's own editor group,
 * where the new editor would cover the board, and never splitting the board's group when another group already
 * exists, which would halve the board's width.
 */

/** An editor group as far as this choice is concerned: its view column and the files its tabs show. */
export interface GroupInfo {
  viewColumn: number;
  /** Absolute paths of the text files shown in its tabs. */
  files: readonly string[];
}

/**
 * The view column of the group to open `file` (or a preview) in beside a board in `boardColumn`: a group that
 * already shows the file, else the first other group (left to right). Undefined when the board's group is the only
 * one (the caller then opens beside it, creating a group) or the board's column is unknown.
 */
export function groupBesideBoard(groups: readonly GroupInfo[], boardColumn: number | undefined, file?: string): number | undefined {
  if (boardColumn === undefined) return undefined;
  const others = groups.filter((group) => group.viewColumn !== boardColumn).sort((a, b) => a.viewColumn - b.viewColumn);
  const showing = file === undefined ? undefined : others.find((group) => group.files.includes(file));
  return (showing ?? others[0])?.viewColumn;
}

/** VS Code's commands that focus the n-th editor group (1-based, left to right); the n-th creates it when n = count + 1. */
export const FOCUS_GROUP_COMMANDS = [
  'workbench.action.focusFirstEditorGroup',
  'workbench.action.focusSecondEditorGroup',
  'workbench.action.focusThirdEditorGroup',
  'workbench.action.focusFourthEditorGroup',
  'workbench.action.focusFifthEditorGroup',
  'workbench.action.focusSixthEditorGroup',
  'workbench.action.focusSeventhEditorGroup',
  'workbench.action.focusEighthEditorGroup',
] as const;

/**
 * The command that makes the group for a preview the active one (VS Code's multi-file diff opens in the active
 * group and takes no view column): the chosen other group, or a new group after the board's when it is the only
 * group. Undefined when there is nothing to do (unknown board column, or more than eight groups).
 */
export function focusCommandBesideBoard(groups: readonly GroupInfo[], boardColumn: number | undefined): string | undefined {
  if (boardColumn === undefined) return undefined;
  const target = groupBesideBoard(groups, boardColumn) ?? (groups.length === 1 ? 2 : undefined);
  return target === undefined ? undefined : FOCUS_GROUP_COMMANDS[target - 1];
}
