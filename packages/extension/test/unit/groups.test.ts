import { describe, expect, it } from 'vitest';

import { focusCommandBesideBoard, groupBesideBoard } from '../../src/logic/groups';

describe('where a board opens files and previews (never over the board, never splitting it twice)', () => {
  const board = { viewColumn: 1, files: [] };
  it('prefers a group that already shows the file, else the first other group; none when the board is alone', () => {
    const groups = [board, { viewColumn: 2, files: ['/m/a.lean'] }, { viewColumn: 3, files: ['/m/b.lean'] }];
    expect(groupBesideBoard(groups, 1, '/m/b.lean')).toBe(3);
    expect(groupBesideBoard(groups, 1, '/m/c.lean')).toBe(2);
    expect(groupBesideBoard(groups, 1)).toBe(2);
    expect(groupBesideBoard([{ viewColumn: 1, files: ['/m/a.lean'] }, { viewColumn: 2, files: [] }], 2, '/m/a.lean')).toBe(1);
    expect(groupBesideBoard([board], 1, '/m/a.lean')).toBeUndefined();
    expect(groupBesideBoard(groups, undefined, '/m/a.lean')).toBeUndefined();
  });

  it('focuses the other group before a preview, or creates the second one when the board is alone', () => {
    expect(focusCommandBesideBoard([board], 1)).toBe('workbench.action.focusSecondEditorGroup');
    expect(focusCommandBesideBoard([board, { viewColumn: 2, files: [] }], 1)).toBe('workbench.action.focusSecondEditorGroup');
    expect(focusCommandBesideBoard([{ viewColumn: 1, files: [] }, { viewColumn: 2, files: [] }], 2)).toBe('workbench.action.focusFirstEditorGroup');
    expect(focusCommandBesideBoard([board], undefined)).toBeUndefined();
  });
});
