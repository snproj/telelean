/**
 * The history dropdown (D-33, A3): each telelean change to this subject as "time · action · label", a read-only
 * Preview (a diff against its parent, opened by the host) and "Revert to this" (confirmed; the revert itself is
 * undoable), the storage counter (disk, not RAM) and "Keep last N" (confirmed: it drops snapshots for good). Without a
 * repository it offers "Initialize git"; other unavailable states explain themselves.
 *
 * The listing is requested while the dropdown is open: when it opens, when history becomes available (e.g. right
 * after "Initialize git"), and when the subject or its undo/redo state changes. Spec v4 ES-9 (slice 1f): while an edit
 * session (a run) is active, "Revert to this" is disabled with the reason; the list and Preview stay.
 */
import type { HistoryAvailability } from '@telelean/core';
import { useEffect, useRef, useState } from 'react';
import { Popover } from '../common/Popover';
import { HISTORY_ACTION_LABEL } from '../labels';
import { formatBytes, formatTime } from '../model/format';
import { useBoard, useBoardActions, useBoardStore } from '../state/context';
import { editLock } from '../state/store';

const PAGE = 50;

function Unavailable({ availability }: { availability: Exclude<HistoryAvailability, { state: 'ready' }> }) {
  const actions = useBoardActions();
  switch (availability.state) {
    case 'no-repo':
      return (
        <div className="tl-history__message" data-testid="history-unavailable" data-state="no-repo">
          <p>History needs a git repository in this model folder. telelean keeps its snapshots under private refs (refs/telelean/…) and never touches your branches.</p>
          <button type="button" className="tl-button tl-button--small" onClick={() => actions.initGit()}>
            Initialize git
          </button>
        </div>
      );
    case 'git-missing':
      return (
        <p className="tl-history__message" data-testid="history-unavailable" data-state="git-missing">
          git is not installed, so there is no history. Board actions and Undo still work.
        </p>
      );
    case 'disabled':
      return (
        <p className="tl-history__message" data-testid="history-unavailable" data-state="disabled">
          History is switched off (setting telelean.git.snapshotRefs). Board actions and Undo still work.
        </p>
      );
    case 'error':
      return (
        <p className="tl-history__message" data-testid="history-unavailable" data-state="error">
          History is unavailable: {availability.detail}
        </p>
      );
  }
}

/** What "Keep last N" would drop: a count when the whole history is listed, null when older entries are not loaded. */
export function pruneCount(entries: number, more: boolean, keepLast: number): number | null {
  if (more) return null;
  return Math.max(0, entries - keepLast);
}

export function HistoryMenu() {
  const workspace = useBoard((s) => s.workspace);
  const subject = useBoard((s) => s.subject);
  const listing = useBoard((s) => s.history);
  const loading = useBoard((s) => s.historyLoading);
  const lock = useBoard((s) => editLock(s));
  const actions = useBoardActions();
  const store = useBoardStore(); // stable (the actions object above is the current state: not an effect dependency)
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const [keep, setKeep] = useState('');
  /** "Keep last N" pressed: N, until the user confirms or cancels. */
  const [confirmKeep, setConfirmKeep] = useState<number | null>(null);
  const limitRef = useRef(limit);
  limitRef.current = limit;

  const availability: HistoryAvailability = workspace?.history ?? { state: 'ready' };
  const isOpen = anchor !== null;
  const ready = availability.state === 'ready';
  const undoLabel = workspace?.undo ?? null;
  const redoLabel = workspace?.redo ?? null;
  useEffect(() => {
    if (isOpen && ready && subject) store.getState().requestHistory(limitRef.current);
  }, [isOpen, ready, subject, undoLabel, redoLabel, store]);

  const open = (element: HTMLElement) => {
    setLimit(PAGE);
    limitRef.current = PAGE;
    setConfirmKeep(null);
    setAnchor(element);
  };
  const close = () => {
    setAnchor(null);
    setConfirmKeep(null);
  };
  const shown = listing && listing.subject === subject ? listing : null;
  const keepLast = Number(keep);
  const keepValid = Number.isInteger(keepLast) && keepLast >= 1 && keepLast <= 100_000;
  const dropping = shown && keepValid ? pruneCount(shown.entries.length, shown.more, keepLast) : null;
  const nothingToDrop = dropping === 0;
  const confirming = confirmKeep !== null && shown ? pruneCount(shown.entries.length, shown.more, confirmKeep) : null;

  return (
    <>
      <button
        type="button"
        className="tl-menu-button"
        data-testid="history-button"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        title="History of this subject: preview or revert to an earlier state"
        onClick={(event) => (anchor ? close() : open(event.currentTarget))}
      >
        <span className="codicon codicon-history" aria-hidden="true" />
        History
        <span className="codicon codicon-chevron-down" aria-hidden="true" />
      </button>
      <Popover anchor={anchor} open={isOpen} onClose={close} label="History" testId="history-menu" className="tl-menu tl-history">
        {availability.state !== 'ready' ? (
          <Unavailable availability={availability} />
        ) : (
          <>
            <div className="tl-history__storage" data-testid="history-storage" title="Disk used by telelean's snapshots (not memory)">
              {shown
                ? `This subject: ${formatBytes(shown.storage.subjectBytes)} · All subjects: ${formatBytes(shown.storage.totalBytes)}`
                : loading
                  ? 'Loading…'
                  : 'No history yet.'}
            </div>
            {shown && shown.entries.length === 0 ? <p className="tl-history__message">No snapshots of {subject} yet.</p> : null}
            {shown && shown.entries.length > 0 ? (
              <ol className="tl-history__entries">
                {shown.entries.map((entry) => (
                  <li key={entry.id} className="tl-history__entry" data-testid="history-entry" data-entry-id={entry.id}>
                    <span className="tl-history__line" title={`${entry.time} · ${entry.label}`}>
                      {`${formatTime(entry.time)} · ${HISTORY_ACTION_LABEL[entry.action] ?? entry.action} · ${entry.label}`}
                    </span>
                    <span className="tl-history__buttons">
                      <button type="button" className="tl-icon-button" title="Show what this change did (read-only diff)" onClick={() => actions.previewHistory(entry.id, 'parent')}>
                        Preview
                      </button>
                      <button
                        type="button"
                        className="tl-icon-button"
                        data-testid="history-revert"
                        disabled={lock !== null}
                        title={lock ?? 'Make this subject look like this again (the current state is kept in the history; undoable)'}
                        onClick={() => {
                          close();
                          actions.openRevert(entry);
                        }}
                      >
                        Revert to this
                      </button>
                    </span>
                  </li>
                ))}
              </ol>
            ) : null}
            {shown?.more ? (
              <button
                type="button"
                className="tl-menu__item"
                onClick={() => {
                  const next = limit + PAGE;
                  setLimit(next);
                  limitRef.current = next;
                  actions.requestHistory(next);
                }}
              >
                Show older entries
              </button>
            ) : null}
            {confirmKeep !== null ? (
              <div className="tl-history__prune tl-history__confirm" role="group" aria-label="Confirm Keep last" data-testid="history-prune-confirm">
                <span className="tl-history__confirm-text">
                  {confirming === null
                    ? `Drop every snapshot of ${subject} except the last ${confirmKeep}?`
                    : `Drop ${confirming} older snapshot${confirming === 1 ? '' : 's'} of ${subject}?`}{' '}
                  This cannot be undone.
                </span>
                <button
                  type="button"
                  className="tl-button tl-button--danger tl-button--small"
                  onClick={() => {
                    actions.pruneHistory(confirmKeep);
                    setConfirmKeep(null);
                    setKeep('');
                  }}
                >
                  Drop them
                </button>
                <button type="button" className="tl-button tl-button--secondary tl-button--small" onClick={() => setConfirmKeep(null)}>
                  Cancel
                </button>
              </div>
            ) : (
              <form
                className="tl-history__prune"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!keepValid || nothingToDrop) return;
                  setConfirmKeep(keepLast);
                }}
              >
                <label className="tl-history__prune-label">
                  Keep the last
                  <input
                    className="tl-input tl-input--number"
                    type="number"
                    min={1}
                    max={100000}
                    aria-label="Keep the last N entries"
                    value={keep}
                    placeholder="N"
                    onChange={(event) => setKeep(event.target.value)}
                  />
                  entries
                </label>
                <button
                  type="submit"
                  className="tl-button tl-button--secondary tl-button--small"
                  disabled={!keepValid || nothingToDrop}
                  title={nothingToDrop && shown ? `${subject} has only ${shown.entries.length} snapshot${shown.entries.length === 1 ? '' : 's'}: nothing to drop` : 'Drop the older snapshots (asks first)'}
                >
                  Keep last
                </button>
              </form>
            )}
          </>
        )}
      </Popover>
    </>
  );
}
