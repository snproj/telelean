/**
 * Claude's words (D-15): italic, with a marker, never in the user's style. Every string the run UI shows that Claude
 * wrote (its messages, questions and options, suggestions, summaries, glosses) goes through this component, so it
 * carries `data-provenance="agent"` (test/e2e/m2-provenance.spec.ts checks that no agent text renders without it).
 *
 * `marker`: where the marker goes. `prefix` puts a small "Claude" label before the text (activity lines, questions);
 * `suffix` adds "(Claude's words)" after it (sentences and glosses, like the cards' "(Claude's wording)"); `none`
 * only inside a container that shows the marker once for all of its Claude texts (`data-agent-scope`: a question
 * card under "Claude asks", a "Claude suggests" card).
 */
export interface AgentTextProps {
  text: string;
  marker?: 'prefix' | 'suffix' | 'none';
  /** The marker's text (default "Claude" before, "(Claude's words)" after). */
  label?: string;
  className?: string;
  /** Block-level (a paragraph) instead of inline. */
  block?: boolean;
  testId?: string;
  id?: string;
}

export function AgentText({ text, marker = 'suffix', label, className, block, testId, id }: AgentTextProps) {
  const Tag = block ? 'p' : 'span';
  const markerText = label ?? (marker === 'prefix' ? 'Claude' : "(Claude's words)");
  return (
    <Tag id={id} className={`tl-agent${block ? ' tl-agent--block' : ''}${className ? ` ${className}` : ''}`} data-provenance="agent" data-testid={testId}>
      {marker === 'prefix' ? <span className="tl-agent__marker tl-agent__marker--prefix">{markerText}</span> : null}
      <span className="tl-agent__text">{text}</span>
      {marker === 'suffix' ? <span className="tl-agent__marker tl-agent__marker--suffix"> {markerText}</span> : null}
    </Tag>
  );
}

/** The user's own words (their sentences, their free-text answers): plain, as on the cards. */
export function UserText({ text, className }: { text: string; className?: string }) {
  return (
    <span className={`tl-user${className ? ` ${className}` : ''}`} data-provenance="user">
      {text}
    </span>
  );
}
