/**
 * Helpers for the extension's file watchers (docs/m1-plan.md section 2, "refresh triggers"): typing is batched per
 * model root (one `invalidate` after ~200 ms of quiet), and the echoes of telelean's own writes (the change, save and
 * file-system events its EditApplier causes) are recognised, since the workspace already knows those texts.
 */

/** Collects paths and calls `flush` once, `delayMs` after the last `add` (a trailing debounce). */
export class PathBatcher {
  private readonly pending = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly delayMs: number,
    private readonly onFlush: (paths: string[]) => void,
  ) {}

  add(paths: Iterable<string>): void {
    for (const path of paths) this.pending.add(path);
    if (this.pending.size === 0) return;
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), this.delayMs);
  }

  /** Delivers what is pending now (e.g. before a save is handled, so the order of events is kept). */
  flush(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    if (this.pending.size === 0) return;
    const paths = [...this.pending].sort();
    this.pending.clear();
    this.onFlush(paths);
  }

  /** Drops `paths` from the pending set (they are being handled another way). */
  drop(paths: Iterable<string>): void {
    for (const path of paths) this.pending.delete(path);
  }

  get size(): number {
    return this.pending.size;
  }

  dispose(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    this.pending.clear();
  }
}

/**
 * What an event observed: the editor's text (document change and save events read the buffer) or the file on disk
 * (file watcher events read the file, which lags behind the buffer).
 */
export type EchoStream = 'editor' | 'disk';

interface RecordedText {
  /** Order of recording (increasing across all paths). */
  seq: number;
  text: string | null;
  until: number;
}

interface PathRecord {
  /** Oldest first. */
  texts: RecordedText[];
  /** Per stream: texts recorded before this `seq` no longer count as echoes for that stream. */
  floor: Record<EchoStream, number>;
}

/**
 * The texts telelean just wrote to each file (null = deleted), in order, for a few seconds: an event whose text
 * equals one of them is an echo of telelean's own write.
 *
 * Each stream observes telelean's writes to a file in order, but an event can be handled late: when telelean writes
 * a file twice in quick succession (an action and its Undo), the file event of the first write may be handled after
 * the second write was recorded, and still read the first text from disk. So an event may match any text recorded
 * since the one its stream matched last (the oldest such match is taken, so a later event can still match a newer
 * one), not only the latest. An event with any other text (the user typed, another program wrote the file) forgets
 * every text recorded so far for its stream, so that a later return to one of them (Undo in the editor) is not
 * mistaken for an echo.
 */
export class SelfWrites {
  private seq = 0;
  private readonly entries = new Map<string, PathRecord>();

  constructor(
    private readonly ttlMs = 5000,
    private readonly now: () => number = Date.now,
  ) {}

  record(writes: ReadonlyArray<{ absPath: string; text: string | null }>): void {
    for (const path of [...this.entries.keys()]) this.fresh(path); // drop expired texts of other files too
    const until = this.now() + this.ttlMs;
    for (const write of writes) {
      const entry = this.fresh(write.absPath) ?? { texts: [], floor: { editor: 0, disk: 0 } };
      entry.texts.push({ seq: ++this.seq, text: write.text, until });
      this.entries.set(write.absPath, entry);
    }
  }

  isEcho(absPath: string, text: string | null, stream: EchoStream = 'editor'): boolean {
    const entry = this.fresh(absPath);
    if (!entry) return false;
    const match = entry.texts.find((t) => t.seq >= entry.floor[stream] && t.text === text);
    if (match) {
      entry.floor[stream] = match.seq;
      return true;
    }
    entry.floor[stream] = this.seq + 1;
    return false;
  }

  /** Whether a fresh write to `absPath` is recorded that `stream` could still echo (before reading the file). */
  has(absPath: string, stream: EchoStream = 'disk'): boolean {
    const entry = this.fresh(absPath);
    return entry !== undefined && entry.texts.some((t) => t.seq >= entry.floor[stream]);
  }

  /** Whether `isEcho` would say yes, without recording anything (it neither advances nor forgets). */
  matches(absPath: string, text: string | null, stream: EchoStream = 'editor'): boolean {
    const entry = this.fresh(absPath);
    return entry !== undefined && entry.texts.some((t) => t.seq >= entry.floor[stream] && t.text === text);
  }

  /** The path's record without its expired texts (removed when none is left). */
  private fresh(absPath: string): PathRecord | undefined {
    const entry = this.entries.get(absPath);
    if (!entry) return undefined;
    const now = this.now();
    entry.texts = entry.texts.filter((t) => t.until >= now);
    if (entry.texts.length > 0) return entry;
    this.entries.delete(absPath);
    return undefined;
  }
}

/**
 * Whether a file-watcher event is an echo of one of `sources` (telelean's own writes, the user's saves the editor
 * events already handled). The file is read only when a source could still echo it, and its text is matched against
 * every source before any of them forgets: only the source it matches records the match. When none matches (another
 * program wrote the file), each source forgets its recorded texts for the disk stream. So a save's echo can no longer
 * make telelean's own write, recorded meanwhile, look like another program's. A file that cannot be read
 * (`undefined`) is no echo and changes nothing.
 */
export async function isDiskEcho(
  sources: readonly SelfWrites[],
  absPath: string,
  readText: () => Promise<string | null | undefined>,
): Promise<boolean> {
  const candidates = sources.filter((source) => source.has(absPath, 'disk'));
  if (candidates.length === 0) return false;
  const text = await readText();
  if (text === undefined) return false;
  const match = candidates.find((source) => source.matches(absPath, text, 'disk'));
  if (match) return match.isEcho(absPath, text, 'disk');
  for (const source of candidates) source.isEcho(absPath, text, 'disk');
  return false;
}
