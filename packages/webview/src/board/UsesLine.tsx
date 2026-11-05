/**
 * The "uses:" line of a formalised card (the user's turn-9 request 2): the vocabulary its Lean statement uses,
 * computed from Lean (`lean.uses`), truncated inline after two names ("HasDarkPast, cynder, …"), with a "▾ N"
 * dropdown that lists every item with its kind and gloss. Choosing one highlights it in the Vocabulary group.
 */
import type { TlNode } from '@telelean/core';
import { useState } from 'react';
import { Popover } from '../common/Popover';
import { VOCAB_KIND_NOUN } from '../labels';
import { displayName, usesInline } from '../model/cardData';
import { useBoard, useBoardActions } from '../state/context';
import { boardView } from '../state/store';

export function UsesLine({ node }: { node: TlNode }) {
  const subject = useBoard((s) => s.subject);
  const vocab = useBoard((s) => boardView(s).vocab);
  const actions = useBoardActions();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const uses = node.lean.uses ?? [];
  if (uses.length === 0) return null;
  const close = () => setAnchor(null);

  return (
    <div className="tl-uses" data-testid="uses">
      <span className="tl-uses__text" title={uses.map((name) => displayName(name, subject, vocab)).join(', ')}>
        {`uses: ${usesInline(uses, subject, vocab)}`}
      </span>
      <button
        type="button"
        className="tl-uses__toggle"
        aria-haspopup="menu"
        aria-expanded={anchor !== null}
        aria-label={`All ${uses.length} vocabulary items this card uses`}
        onClick={(event) => {
          event.stopPropagation();
          setAnchor(anchor ? null : event.currentTarget);
        }}
      >
        {`▾ ${uses.length}`}
      </button>
      <Popover anchor={anchor} open={anchor !== null} onClose={close} role="menu" label="Vocabulary this card uses" testId="uses-menu" className="tl-menu">
        {uses.map((name) => {
          const item = vocab.get(name);
          return (
            <button
              key={name}
              type="button"
              role="menuitem"
              className="tl-menu__item tl-uses__entry"
              data-vocab={name}
              disabled={!item}
              title={item ? `Show ${item.shortName} in the Vocabulary group` : `${name} is not in this subject's vocabulary`}
              onClick={() => {
                close();
                actions.highlightVocab(name);
              }}
            >
              <span className="tl-uses__name">{displayName(name, subject, vocab)}</span>
              <span className="tl-uses__kind">{item ? VOCAB_KIND_NOUN[item.kind] : 'elsewhere'}</span>
              {item?.gloss ? (
                <span className={item.glossBy === 'agent' ? 'tl-uses__gloss tl-gloss--agent' : 'tl-uses__gloss'} data-provenance={item.glossBy === 'agent' ? 'agent' : 'user'}>
                  {item.gloss}
                  {item.glossBy === 'agent' ? <span className="tl-card__agent-marker tl-agent__marker"> (Claude's wording)</span> : null}
                </span>
              ) : null}
            </button>
          );
        })}
      </Popover>
    </div>
  );
}
