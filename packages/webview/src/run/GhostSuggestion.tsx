/**
 * A premise Claude suggests (D-6 ghost assumption): translucent, with a "Claude suggests" marker (dashing is reserved
 * for the user's declared support, D-15), Claude's sentence and reason in Claude's style, the Lean proposition, the
 * "closes the gap (checked)" chip and D-6's flag for a suggestion that alone gives the goal.
 *
 * "I hold this" asks for an optional reason (one line, D-6: encouraged, not required) and posts `adoptGhost`; "No"
 * posts `rejectGhost`. Both work only while the run is in review (adoption starts a new round, decision 12).
 * Shown as a card in the Axioms column of the proposed view, and in the report card of the review.
 */
import type { GhostView } from '@telelean/core';
import { useLayoutEffect, useRef, useState, type MouseEvent } from 'react';
import { AgentText } from '../common/AgentText';
import { pasteOneLine } from '../common/OneLineInput';
import { useBoard, useBoardActions } from '../state/context';

const stop = (event: MouseEvent) => event.stopPropagation();

export function GhostSuggestion({ ghost, variant }: { ghost: GhostView; variant: 'board' | 'panel' }) {
  const decidable = useBoard((s) => s.run?.state === 'review' && s.runBusy === null);
  const busy = useBoard((s) => (s.runBusy?.key === ghost.id ? s.runBusy.action : null));
  const actions = useBoardActions();
  const [asking, setAsking] = useState(false);
  const [why, setWhy] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    if (asking) input.current?.focus();
  }, [asking]);

  const adopt = () => {
    actions.adoptGhost(ghost.id, why);
    setAsking(false);
  };

  return (
    <div
      className="tl-ghost"
      role={variant === 'board' ? 'listitem' : undefined}
      data-ghost-id={ghost.id}
      data-variant={variant}
      data-testid="ghost"
      data-agent-scope
      onClick={stop}
    >
      <div className="tl-ghost__marker tl-agent__marker">
        <span className="codicon codicon-lightbulb-sparkle" aria-hidden="true" /> Claude suggests
      </div>
      <AgentText text={ghost.naturalName} marker="none" block className="tl-ghost__sentence" testId="ghost-sentence" />
      <div className="tl-ghost__why">
        <span className="tl-ghost__label">Why it is needed:</span> <AgentText text={ghost.whyNeeded} marker="none" testId="ghost-why" />
      </div>
      <pre className="tl-lean tl-ghost__lean" data-testid="ghost-lean">
        {ghost.leanStatement}
      </pre>
      <div className="tl-card__meta">
        {ghost.closesGap ? (
          <span className="tl-chip tl-chip--lean" data-chip="closes-gap" title="telelean checked in Lean that your selected premises plus this suggestion prove the target">
            closes the gap (checked)
          </span>
        ) : null}
        {ghost.aloneEntails ? (
          <span className="tl-chip tl-chip--attention" data-chip="alone-entails" title="Its proof that it closes the gap uses none of your selected premises (D-6)">
            gives the goal on its own: it may simply restate it
          </span>
        ) : null}
        <span className="tl-chip tl-chip--subtle" title="The Lean name the new axiom would get">
          {ghost.leanName}
        </span>
      </div>
      {asking ? (
        <form
          className="tl-ghost__adopt"
          onSubmit={(event) => {
            event.preventDefault();
            adopt();
          }}
        >
          <input
            ref={input}
            className="tl-input"
            type="text"
            aria-label="Why do you hold it? (optional)"
            placeholder="Why do you hold it? (optional)"
            value={why}
            maxLength={4000}
            onChange={(event) => setWhy(event.target.value)}
            onPaste={(event) => pasteOneLine(event, setWhy)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                setAsking(false);
              }
            }}
          />
          <button type="submit" className="tl-button tl-button--small" disabled={!decidable}>
            Adopt
          </button>
          <button type="button" className="tl-button tl-button--secondary tl-button--small" onClick={() => setAsking(false)}>
            Cancel
          </button>
        </form>
      ) : (
        <div className="tl-ghost__buttons">
          <button
            type="button"
            className="tl-button tl-button--small"
            disabled={!decidable}
            title="Adopt it as your axiom (worded by Claude; it stays marked as Claude's wording). Claude then proves the target with it."
            onClick={() => setAsking(true)}
          >
            {busy === 'adopt' ? 'Adopting…' : 'I hold this'}
          </button>
          <button type="button" className="tl-button tl-button--secondary tl-button--small" disabled={!decidable} title="You do not hold it" onClick={() => actions.rejectGhost(ghost.id)}>
            {busy === 'reject' ? 'Rejecting…' : 'No'}
          </button>
        </div>
      )}
    </div>
  );
}
