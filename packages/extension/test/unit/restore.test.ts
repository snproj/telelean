import { describe, expect, it } from 'vitest';

import { boardTitle, parseRecords, restoreTarget, updateRecords, type BoardRecord } from '../../src/logic/restore';

const A = '/w/mental_model';
const B = '/w/other/model';
const C = '/w/second/model';

describe('board titles', () => {
  it('names the folder, and its parent when two roots share the folder name', () => {
    expect(boardTitle(A)).toBe('telelean: mental_model');
    expect(boardTitle(B, [A, B])).toBe('telelean: model');
    expect(boardTitle(B, [A, B, C])).toBe('telelean: model (other)');
  });
});

describe('restore after a reload (AT5.4)', () => {
  const records: BoardRecord[] = [
    { root: B, title: 'telelean: model (other)', subject: 'Bayonetta' },
    { root: A, title: 'telelean: mental_model', subject: 'Spyro' },
  ];

  it('uses a root and subject saved in the webview state when present', () => {
    expect(restoreTarget({ state: { root: A, subject: 'Other' }, title: 'whatever', roots: [A, B], records })).toEqual({ root: A, subject: 'Other' });
    expect(restoreTarget({ state: { telelean: { root: B } }, title: 'x', roots: [A, B], records })).toEqual({ root: B, subject: 'Bayonetta' });
  });

  it('otherwise finds the host record by the panel title (root and subject)', () => {
    expect(restoreTarget({ state: undefined, title: 'telelean: mental_model', roots: [A, B, C], records })).toEqual({ root: A, subject: 'Spyro' });
    expect(restoreTarget({ state: { collapsed: true }, title: 'telelean: model (other)', roots: [A, B, C], records })).toEqual({ root: B, subject: 'Bayonetta' });
  });

  it('falls back to the folder name in the title, then to the only root', () => {
    expect(restoreTarget({ state: null, title: 'telelean: mental_model', roots: [A, C], records: [] })).toEqual({ root: A });
    expect(restoreTarget({ state: null, title: 'telelean: model', roots: [B, C], records: [] })).toBeUndefined();
    expect(restoreTarget({ state: null, title: 'telelean', roots: [C], records: [] })).toEqual({ root: C });
    expect(restoreTarget({ state: null, title: 'telelean', roots: [], records: [] })).toBeUndefined();
  });

  it('ignores a saved root that is neither a known root nor recorded', () => {
    expect(restoreTarget({ state: { root: '/elsewhere' }, title: 'x', roots: [A, B], records: [] })).toBeUndefined();
  });

  it('keeps one record per root, newest first, and parses stored records leniently', () => {
    const next = updateRecords(records, { root: A, title: 'telelean: mental_model', subject: 'Other' });
    expect(next).toEqual([{ root: A, title: 'telelean: mental_model', subject: 'Other' }, records[0]]);
    expect(parseRecords([{ root: A, title: 't' }, { root: 3 }, 'x', { title: 'no root' }, { root: B, title: 'u', subject: 'S' }])).toEqual([
      { root: A, title: 't' },
      { root: B, title: 'u', subject: 'S' },
    ]);
    expect(parseRecords(undefined)).toEqual([]);
  });
});
