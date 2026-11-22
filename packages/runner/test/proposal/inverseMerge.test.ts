/**
 * Slice 2e (docs/slice2-plan.md 3.6, 4.6): `inverseMerge`, a shadow commit's inverse merged onto the head (un-reject,
 * Undo): no change, one file, many files (path order), a file the commit created or deleted, a head that still holds
 * the commit's text, a later change far from the reverted lines (merged) and next to them (a conflict naming the file,
 * nothing merged).
 */
import { describe, expect, it } from 'vitest';

import { inverseMerge } from '../../src/proposal/files.js';

const lines = (n: number, tag = 'line') => Array.from({ length: n }, (_, k) => `${tag} ${k + 1}`).join('\n') + '\n';
const map = (entries: Record<string, string>) => new Map(Object.entries(entries));

describe('inverseMerge (slice 2e)', () => {
  it('a commit that changed nothing keeps the head as it is (empty)', () => {
    const files = map({ 'A.lean': 'a\n' });
    const out = inverseMerge(files, files, map({ 'A.lean': 'a, edited later\n', 'B.lean': 'b\n' }));
    expect(out).toEqual({ ok: true, files: map({ 'A.lean': 'a, edited later\n', 'B.lean': 'b\n' }) });
  });

  it('one file: a head still holding the commit\'s text gets the parent\'s at once; other files keep the head\'s text', () => {
    const parent = map({ 'A.lean': 'keep\nproof\n', 'B.lean': 'b\n' });
    const commit = map({ 'A.lean': 'keep\n', 'B.lean': 'b\n' });
    const out = inverseMerge(commit, parent, map({ 'A.lean': 'keep\n', 'B.lean': 'b, later\n' }));
    expect(out).toEqual({ ok: true, files: map({ 'A.lean': 'keep\nproof\n', 'B.lean': 'b, later\n' }) });
  });

  it('many files, a created and a deleted one among them: each change is undone', () => {
    const parent = map({ 'A.lean': 'a\nx\n', 'Old.lean': 'old\n' });
    const commit = map({ 'A.lean': 'a\n', 'New.lean': 'new\n' });
    const out = inverseMerge(commit, parent, map({ 'A.lean': 'a\n', 'New.lean': 'new\n', 'Other.lean': 'o\n' }));
    expect(out).toEqual({ ok: true, files: map({ 'A.lean': 'a\nx\n', 'Old.lean': 'old\n', 'Other.lean': 'o\n' }) });
  });

  it('a later change far from the reverted lines merges (the 3-line patch, no fuzz)', () => {
    const before = lines(20);
    const commit = map({ 'A.lean': before.replace('line 3\n', '') });
    const parent = map({ 'A.lean': before });
    const head = map({ 'A.lean': before.replace('line 3\n', '').replace('line 18\n', 'line 18, changed later\n') });
    expect(inverseMerge(commit, parent, head)).toEqual({ ok: true, files: map({ 'A.lean': before.replace('line 18\n', 'line 18, changed later\n') }) });
  });

  it('a later change next to the reverted lines conflicts: the first such file in path order, nothing merged', () => {
    const before = lines(20);
    const commit = map({ 'B.lean': before.replace('line 10\n', ''), 'C.lean': before.replace('line 10\n', '') });
    const parent = map({ 'B.lean': before, 'C.lean': before });
    const near = before.replace('line 10\n', '').replace('line 11\n', 'line 11, changed later\n');
    expect(inverseMerge(commit, parent, map({ 'B.lean': near, 'C.lean': near }))).toEqual({ ok: false, file: 'B.lean' });
    // A file the commit created that a later write changed, or deleted, cannot be taken out again either.
    expect(inverseMerge(map({ 'N.lean': 'n\n' }), map({}), map({ 'N.lean': 'n, changed\n' }))).toEqual({ ok: false, file: 'N.lean' });
    expect(inverseMerge(map({}), map({ 'D.lean': 'd\n' }), map({ 'D.lean': 'd, made again\n' }))).toEqual({ ok: false, file: 'D.lean' });
  });
});
