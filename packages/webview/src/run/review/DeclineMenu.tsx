/**
 * Slice 2g (docs/slice2-plan.md 5.7): the decline menu, inline where it was opened (the detail's Decline ▾, the list's
 * Decline…, a report's Ask me instead). Reject (and an arrow item's one Decline) declines at once; Shaky shows its
 * "Note for Claude (optional)" field and its own Decline button; Transform… is listed, disabled, with why (D2-14).
 * R and S choose Reject and Shaky from the keyboard while it is open; Esc closes it.
 */
import { DECLINE_OPTION_TEXTS, LIMITS, REVIEW_TEXTS } from '@telelean/core';
import { useLayoutEffect, useRef } from 'react';
import type { DeclineEntry } from '../../model/review';
import { useBoard, useBoardActions } from '../../state/context';

/** Builder 2g: the Shaky note's own Decline button. */
export const DECLINE_SHAKY = `${DECLINE_OPTION_TEXTS.plain} (${DECLINE_OPTION_TEXTS.shaky})`;

export function DeclineMenu({ entries, testId = 'decline-menu' }: { entries: readonly DeclineEntry[]; testId?: string }) {
  const menu = useBoard((s) => s.declineMenu);
  const actions = useBoardActions();
  const note = useRef<HTMLTextAreaElement>(null);
  const first = useRef<HTMLButtonElement>(null);
  const shaky = menu?.option === 'shaky';
  useLayoutEffect(() => {
    if (shaky) note.current?.focus();
    else first.current?.focus();
  }, [shaky]);
  if (menu === null) return null;
  return (
    <div
      className="tl-decline"
      data-testid={testId}
      role="group"
      aria-label={DECLINE_OPTION_TEXTS.plain}
      onKeyDown={(event) => {
        const typing = event.target instanceof HTMLTextAreaElement;
        const plain = !event.ctrlKey && !event.metaKey && !event.altKey;
        const key = event.key.toLowerCase();
        if (event.key === 'Escape') actions.closeDeclineMenu();
        else if (!typing && plain && (key === 'r' || key === 's') && entries.some((e) => e.option === (key === 'r' ? 'reject' : 'shaky') && e.disabled === undefined))
          actions.chooseDeclineOption(key === 'r' ? 'reject' : 'shaky');
        else return;
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <div className="tl-decline__options">
        {entries.map((entry, i) => (
          <div key={entry.option} className="tl-decline__option" data-option={entry.option}>
            <button
              ref={i === 0 ? first : undefined}
              type="button"
              className={`tl-button tl-button--small${entry.option === 'shaky' && shaky ? '' : ' tl-button--secondary'}`}
              data-testid={`decline-${entry.option}`}
              disabled={entry.disabled !== undefined}
              aria-pressed={entry.note ? shaky : undefined}
              title={entry.disabled ?? entry.description ?? entry.label}
              onClick={() => actions.chooseDeclineOption(entry.option)}
            >
              {entry.label}
            </button>
            {entry.description !== undefined ? <span className="tl-decline__description">{entry.description}</span> : null}
            {entry.disabled !== undefined ? <span className="tl-decline__description">{entry.disabled}</span> : null}
          </div>
        ))}
      </div>
      {shaky ? (
        <div className="tl-decline__note">
          <label className="tl-decline__label" htmlFor="tl-decline-note">
            {REVIEW_TEXTS.noteForClaude}
          </label>
          <textarea
            id="tl-decline-note"
            ref={note}
            className="tl-input tl-decline__text"
            data-testid="decline-note"
            rows={3}
            maxLength={LIMITS.textLength}
            value={menu.note}
            onChange={(event) => actions.setDeclineNote(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                actions.confirmDeclineMenu();
              }
            }}
          />
          <div className="tl-decline__buttons">
            <button type="button" className="tl-button tl-button--small" data-testid="decline-confirm" onClick={() => actions.confirmDeclineMenu()}>
              {DECLINE_SHAKY}
            </button>
            <button type="button" className="tl-button tl-button--secondary tl-button--small" onClick={() => actions.closeDeclineMenu()}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="tl-decline__buttons">
          <button type="button" className="tl-button tl-button--secondary tl-button--small" data-testid="decline-cancel" onClick={() => actions.closeDeclineMenu()}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
