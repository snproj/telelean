import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { isDiskEcho, PathBatcher, SelfWrites } from '../../src/logic/changeBatcher';
import { formatEntryTime, previewRows, previewTitle, PreviewStore } from '../../src/logic/historyPreview';
import { chooseRoot, matchRoot, rootPickItems } from '../../src/logic/roots';

describe('typing batches (one invalidate after ~200 ms of quiet)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('collects paths and flushes once after the last change', () => {
    const flushed: string[][] = [];
    const batcher = new PathBatcher(200, (paths) => flushed.push(paths));
    batcher.add(['b.lean']);
    vi.advanceTimersByTime(150);
    batcher.add(['a.lean', 'b.lean']);
    vi.advanceTimersByTime(150);
    expect(flushed).toEqual([]);
    vi.advanceTimersByTime(60);
    expect(flushed).toEqual([['a.lean', 'b.lean']]);
    batcher.add(['c.lean']);
    batcher.drop(['c.lean']);
    batcher.flush();
    expect(flushed).toHaveLength(1);
    batcher.add(['d.lean']);
    batcher.dispose();
    vi.advanceTimersByTime(1000);
    expect(flushed).toHaveLength(1);
  });
});

describe('echoes of telelean writes', () => {
  it('recognises the written text for a while; any other text forgets the record', () => {
    let now = 0;
    const writes = new SelfWrites(5000, () => now);
    writes.record([
      { absPath: '/m/a.lean', text: 'new\n' },
      { absPath: '/m/b.lean', text: null },
    ]);
    expect(writes.isEcho('/m/a.lean', 'new\n')).toBe(true);
    expect(writes.isEcho('/m/a.lean', 'new\n')).toBe(true); // change, save and file events all echo
    expect(writes.isEcho('/m/b.lean', null)).toBe(true);
    expect(writes.isEcho('/m/a.lean', 'user typed\n')).toBe(false);
    expect(writes.isEcho('/m/a.lean', 'new\n')).toBe(false); // forgotten after the user's change
    writes.record([{ absPath: '/m/c.lean', text: 'c' }]);
    now = 6000;
    expect(writes.has('/m/c.lean')).toBe(false);
    expect(writes.isEcho('/m/c.lean', 'c')).toBe(false);
  });

  it('two quick writes to one file: a late file event of the first write and the next event are both echoes', () => {
    // An action (T1) and its Undo (T0) in quick succession: the file event of the first write is handled after the
    // second write was recorded, and reads T1 from disk; the next event reads T0 (the race behind the smoke flake).
    const writes = new SelfWrites(5000, () => 0);
    writes.record([{ absPath: '/m/Inbox.lean', text: 'T1' }]);
    expect(writes.isEcho('/m/Inbox.lean', 'T1', 'editor')).toBe(true); // the editor saw T1 at once
    writes.record([{ absPath: '/m/Inbox.lean', text: 'T0' }]);
    expect(writes.isEcho('/m/Inbox.lean', 'T0', 'editor')).toBe(true);
    expect(writes.has('/m/Inbox.lean', 'disk')).toBe(true);
    expect(writes.isEcho('/m/Inbox.lean', 'T1', 'disk')).toBe(true); // late
    expect(writes.isEcho('/m/Inbox.lean', 'T0', 'disk')).toBe(true);
    expect(writes.isEcho('/m/Inbox.lean', 'T0', 'disk')).toBe(true); // change and create events of one write
    // Once the disk showed T0, T1 is no echo there any more (another program wrote it back).
    expect(writes.isEcho('/m/Inbox.lean', 'T1', 'disk')).toBe(false);
    expect(writes.has('/m/Inbox.lean', 'disk')).toBe(false);
  });

  it('the same text written twice: the oldest match is taken, so a later event can still match the write in between', () => {
    // T0 (revert), T1 (undo the revert), T0 again (redo): the first file event reads T0 (only the first write is on
    // disk yet), the next one T1.
    const writes = new SelfWrites(5000, () => 0);
    for (const text of ['T0', 'T1', 'T0']) writes.record([{ absPath: '/m/Main.lean', text }]);
    expect(writes.isEcho('/m/Main.lean', 'T0', 'disk')).toBe(true);
    expect(writes.isEcho('/m/Main.lean', 'T1', 'disk')).toBe(true);
    expect(writes.isEcho('/m/Main.lean', 'T0', 'disk')).toBe(true);
  });

  it('a return to an earlier telelean text after it was replaced in the editor (Undo in the editor) is not an echo', () => {
    const writes = new SelfWrites(5000, () => 0);
    writes.record([{ absPath: '/m/Main.lean', text: 'T1' }]);
    expect(writes.isEcho('/m/Main.lean', 'T1', 'editor')).toBe(true);
    writes.record([{ absPath: '/m/Main.lean', text: 'T0' }]);
    expect(writes.isEcho('/m/Main.lean', 'T0', 'editor')).toBe(true);
    expect(writes.isEcho('/m/Main.lean', 'T1', 'editor')).toBe(false); // the editor went back to T1: the user's change
    // The streams are separate: the disk has not seen T0 yet, so T1 there is still the late echo of the first write.
    expect(writes.isEcho('/m/Main.lean', 'T1', 'disk')).toBe(true);
    // Any other text forgets what was recorded so far, for that stream; a new write counts again.
    expect(writes.isEcho('/m/Main.lean', 'typed', 'disk')).toBe(false);
    expect(writes.isEcho('/m/Main.lean', 'T0', 'disk')).toBe(false);
    writes.record([{ absPath: '/m/Main.lean', text: 'T2' }]);
    expect(writes.isEcho('/m/Main.lean', 'T2', 'disk')).toBe(true);
    expect(writes.isEcho('/m/Main.lean', 'T2', 'editor')).toBe(true);
  });

  it('recorded texts expire one by one', () => {
    let now = 0;
    const writes = new SelfWrites(5000, () => now);
    writes.record([{ absPath: '/m/a.lean', text: 'old' }]);
    now = 3000;
    writes.record([{ absPath: '/m/a.lean', text: 'new' }]);
    now = 6000; // 'old' expired, 'new' did not
    expect(writes.isEcho('/m/a.lean', 'new', 'disk')).toBe(true);
    expect(writes.has('/m/a.lean', 'editor')).toBe(true);
    now = 8100;
    expect(writes.has('/m/a.lean', 'editor')).toBe(false);
    expect(writes.isEcho('/m/a.lean', 'new', 'editor')).toBe(false);
  });

  it('matches() answers like isEcho without recording a match or forgetting', () => {
    const writes = new SelfWrites(5000, () => 0);
    writes.record([{ absPath: '/m/a.lean', text: 'T1' }]);
    expect(writes.matches('/m/a.lean', 'other', 'disk')).toBe(false);
    expect(writes.matches('/m/a.lean', 'T1', 'disk')).toBe(true); // nothing was forgotten
    expect(writes.matches('/m/b.lean', 'T1', 'disk')).toBe(false);
    expect(writes.isEcho('/m/a.lean', 'T1', 'disk')).toBe(true);
  });
});

describe('file-watcher echoes: telelean writes and the user saves already handled', () => {
  const PATH = '/m/Main.lean';
  /** A watcher event's read of the file: resolves `text` and counts the reads (`reads.count`). */
  const reader = (text: string | null | undefined) => {
    const reads = { count: 0 };
    const read = () => {
      reads.count += 1;
      return Promise.resolve(text);
    };
    return Object.assign(read, { reads });
  };

  it("a save's echo does not make telelean's write, recorded before that event was handled, look like another program's", async () => {
    // The user saves U; a board action writes T1 to the same file before the save's file event is handled.
    const selfWrites = new SelfWrites(5000, () => 0);
    const userSaves = new SelfWrites(5000, () => 0);
    userSaves.record([{ absPath: PATH, text: 'U' }]);
    selfWrites.record([{ absPath: PATH, text: 'T1' }]);
    expect(await isDiskEcho([selfWrites, userSaves], PATH, reader('U'))).toBe(true); // the save's event
    expect(await isDiskEcho([selfWrites, userSaves], PATH, reader('T1'))).toBe(true); // telelean's own write: still an echo
    expect(await isDiskEcho([selfWrites, userSaves], PATH, reader('T1'))).toBe(true); // its second (create/change) event
  });

  it('another text is no echo and forgets in every source; nothing recorded means no read at all', async () => {
    const selfWrites = new SelfWrites(5000, () => 0);
    const userSaves = new SelfWrites(5000, () => 0);
    const none = reader('X');
    expect(await isDiskEcho([selfWrites, userSaves], PATH, none)).toBe(false);
    expect(none.reads.count).toBe(0);
    userSaves.record([{ absPath: PATH, text: 'U' }]);
    selfWrites.record([{ absPath: PATH, text: 'T1' }]);
    const other = reader('written by a script');
    expect(await isDiskEcho([selfWrites, userSaves], PATH, other)).toBe(false);
    expect(other.reads.count).toBe(1); // read once for both sources
    // Both forgot: a later return to U or T1 on disk is not mistaken for an echo.
    expect(await isDiskEcho([selfWrites, userSaves], PATH, reader('U'))).toBe(false);
    expect(await isDiskEcho([selfWrites, userSaves], PATH, reader('T1'))).toBe(false);
  });

  it('a deleted file echoes a recorded deletion; an unreadable file is no echo and changes nothing', async () => {
    const selfWrites = new SelfWrites(5000, () => 0);
    selfWrites.record([{ absPath: PATH, text: null }]);
    expect(await isDiskEcho([selfWrites], PATH, reader(undefined))).toBe(false);
    expect(await isDiskEcho([selfWrites], PATH, reader(null))).toBe(true);
  });
});

describe('history preview documents', () => {
  const diff = {
    entry: { id: 'abc1234', time: '2026-11-01T10:05:00.000Z', action: 'delete-node' as const, label: 'Delete: x', subject: 'Spyro', nodes: ['x'] },
    compare: 'parent' as const,
    files: [
      { path: 'Model/Spyro/Inbox.lean', before: 'a\n', after: 'a\nb\n' },
      { path: '.telelean/subjects/Spyro/attic/x.lean', before: null, after: 'theorem x' },
      { path: 'Model/Spyro/Old.lean', before: 'old', after: null },
    ],
  };

  it('has one row per file; created files have no left side, deleted files no right side', () => {
    const rows = previewRows(diff, 'p1');
    expect(rows.map((r) => [r.path, Boolean(r.left), Boolean(r.right)])).toEqual([
      ['Model/Spyro/Inbox.lean', true, true],
      ['.telelean/subjects/Spyro/attic/x.lean', false, true],
      ['Model/Spyro/Old.lean', true, false],
    ]);
    expect(formatEntryTime('not a date')).toBe('not a date');
  });

  it('has a short tab title: the label cut at 40 characters, the time, and "vs now" for a comparison with the files now', () => {
    const local = (y: number, m: number, d: number, h: number, min: number) => new Date(y, m - 1, d, h, min).toISOString();
    const at = (label: string, time: string, compare: 'parent' | 'current' = 'parent') => ({ ...diff, compare, entry: { ...diff.entry, label, time } });
    const now = new Date(2026, 10, 1, 15, 0); // 2026-11-01 15:00 local
    expect(previewTitle(at('Delete: x', local(2026, 11, 1, 14, 3)), now)).toBe('History: Delete: x (14:03)');
    expect(previewTitle(at('Delete: x', local(2026, 10, 31, 9, 5), 'current'), now)).toBe('History: Delete: x (Oct 31 09:05) vs now');
    expect(previewTitle(at('Delete: x', local(2025, 12, 31, 23, 59)), now)).toBe('History: Delete: x (2025-12-31 23:59)');
    const long = previewTitle(at('Undo: Make Goal: Cynder is a character who has a dark past (dependents rewritten)', local(2026, 11, 1, 14, 3)), now);
    expect(long).toBe('History: Undo: Make Goal: Cynder is a character… (14:03)');
    expect(long.length).toBeLessThan(60);
  });

  it('stores the documents of the last previews only', () => {
    const store = new PreviewStore(2);
    const [row] = previewRows(diff, 'p1');
    store.add('p1', previewRows(diff, 'p1'));
    expect(store.get(`/${row?.path}`, row?.left?.key ?? '')).toBe('a\n');
    store.add('p2', previewRows(diff, 'p2'));
    store.add('p3', previewRows(diff, 'p3'));
    expect(store.get(`/${row?.path}`, row?.left?.key ?? '')).toBeUndefined();
  });
});

describe('choosing a model root (AT5.1)', () => {
  it('none -> offer Initialize, one -> open it, several -> ask', () => {
    expect(chooseRoot([])).toEqual({ kind: 'none' });
    expect(chooseRoot(['/w/a', '/w/a'])).toEqual({ kind: 'single', root: '/w/a' });
    expect(chooseRoot(['/w/b', '/w/a'])).toEqual({ kind: 'ask', roots: ['/w/a', '/w/b'] });
  });

  it('matches a quick-pick answer by path or by a unique folder name', () => {
    const roots = ['/w/mental_model', '/w/second_model', '/x/model', '/y/model'];
    expect(matchRoot(roots, '/w/second_model')).toBe('/w/second_model');
    expect(matchRoot(roots, 'mental_model')).toBe('/w/mental_model');
    expect(matchRoot(roots, 'model')).toBeUndefined();
    expect(matchRoot(roots, 'nothing')).toBeUndefined();
    expect(rootPickItems(['/w/ws/a', '/w/ws/sub/b'], ['/w/ws'])).toEqual([
      { label: 'a', description: 'ws/a', root: '/w/ws/a' },
      { label: 'b', description: 'ws/sub/b', root: '/w/ws/sub/b' },
    ]);
  });
});
