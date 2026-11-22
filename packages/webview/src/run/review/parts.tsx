/**
 * Slice 2g: small pieces of the review panel. A label renders its parts with their provenance (D-15): the user's words
 * plain, Claude's in AgentText (italic, with its marker), Lean names in code font.
 */
import type { CardRef, SessionView } from '@telelean/core';
import { useMemo } from 'react';
import { AgentText, UserText } from '../../common/AgentText';
import { agentPhrases, itemLabelParts, markAgent, type LabelPart, type NamedCard } from '../../model/review';
import { useBoardActions } from '../../state/context';

/** `marker`: Claude's words carry "(Claude)" here (rows and lines), or the default "(Claude's words)". */
export function Label({ parts, short = true }: { parts: readonly LabelPart[]; short?: boolean }) {
  return (
    <>
      {parts.map((p, i) =>
        p.kind === 'words' ? (
          p.by === 'agent' ? (
            <AgentText key={i} text={p.text} {...(short ? { label: '(Claude)' } : {})} />
          ) : (
            <UserText key={i} text={p.text} />
          )
        ) : p.kind === 'code' ? (
          <code key={i} className="tl-review-code">
            {p.text}
          </code>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}

/** Claude's phrases the host's texts may embed (memoised per session view). */
export function usePhrases(session: SessionView): string[] {
  return useMemo(() => agentPhrases(session), [session]);
}

/** One of the host's texts, with Claude's phrases in Claude's style (D-15). */
export function Marked({ text, phrases }: { text: string; phrases: readonly string[] }) {
  return <Label parts={markAgent(text, phrases)} />;
}

/** The phrases are worked out only here, where a link has no item to read its label from (F-V2G-FC-8). */
function MarkedFallback({ text, session }: { text: string; session: SessionView }) {
  return <Marked text={text} phrases={usePhrases(session)} />;
}

/** A link to an item: its label in parts (the cards' sentences in their author's style), else the host's label. */
export function ItemLink({ id, session, fallback, testId, onOpen }: { id: string; session: SessionView; fallback?: string; testId?: string; onOpen?: (id: string) => void }) {
  const actions = useBoardActions();
  const item = session.items.find((i) => i.id === id);
  return (
    <button type="button" className="tl-link" data-testid={testId} data-item={id} onClick={() => (onOpen ? onOpen(id) : actions.focusItem(id))}>
      {item !== undefined ? <Label parts={itemLabelParts(item)} /> : <MarkedFallback text={fallback ?? id} session={session} />}
    </button>
  );
}

/** A card the board names (its sentence), in its author's style, quoted. */
export function NamedCardWords({ card }: { card: NamedCard }) {
  return <CardWords card={{ sentence: card.name, wordedBy: card.by }} quoted />;
}

/** A card's sentence in its author's style. */
export function CardWords({ card, quoted = false }: { card: Pick<CardRef, 'sentence' | 'wordedBy'>; quoted?: boolean }) {
  const words = card.wordedBy === 'agent' ? <AgentText text={card.sentence} label="(Claude)" /> : <UserText text={card.sentence} />;
  return quoted ? <>“{words}”</> : words;
}

/** The status as glyph and word (never colour alone). */
export function StatusMark({ glyph, word, status }: { glyph: string; word: string; status: string }) {
  return (
    <span className="tl-review-status" data-status={status} data-testid="item-status">
      <span className="tl-review-status__glyph" aria-hidden="true">
        {glyph}
      </span>{' '}
      {word}
    </span>
  );
}

export function Badges({ badges, markers }: { badges: readonly string[]; markers: readonly string[] }) {
  if (badges.length === 0 && markers.length === 0) return null;
  return (
    <span className="tl-review-badges">
      {badges.map((b) => (
        <span key={b} className="tl-review-badge" data-testid="item-badge">
          {b}
        </span>
      ))}
      {markers.map((m) => (
        <span key={m} className="tl-review-marker" data-testid="item-marker">
          {m}
        </span>
      ))}
    </span>
  );
}

/** A busy spinner (a decision on its way). */
export function Spinner({ label }: { label: string }) {
  return <span className="codicon codicon-loading codicon-modifier-spin tl-review-spinner" role="img" aria-label={label} />;
}
