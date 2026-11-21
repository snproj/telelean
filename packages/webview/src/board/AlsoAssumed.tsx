/**
 * The AXIOMS column header's second line (spec v4 BD-1, slice 1c): "also assumed: K pending claims, N existence
 * assumptions, M hidden assumptions". Each part links to its cards or Vocabulary items: one item is shown at once
 * (the card is revealed, the item highlighted in the Vocabulary column), several open a menu to choose from.
 */
import { Fragment, useMemo, useState } from 'react';
import { Popover } from '../common/Popover';
import { displayName, presuppositionLabel } from '../model/cardData';
import { useBoard, useBoardActions } from '../state/context';
import { boardView, proposedOverlay } from '../state/store';
import { alsoAssumed, alsoAssumedParts, type AssumedKind } from './assumed';

const TITLE: Readonly<Record<AssumedKind, string>> = {
  pending: 'Propositions pending proof: their `.holds` is a Lean axiom, assumed until a run proves it',
  existence: 'Presuppositions: Lean assumes these kinds of things exist (in the Vocabulary column)',
  hidden: 'Prop-valued Lean axioms with no card (TL104): Lean takes them as given (in the Vocabulary column)',
};

export function AlsoAssumedLine() {
  const nodes = useBoard((s) => boardView(s).nodes);
  const order = useBoard((s) => boardView(s).order);
  const vocabulary = useBoard((s) => boardView(s).vocabulary);
  const vocab = useBoard((s) => boardView(s).vocab);
  const subject = useBoard((s) => s.subject);
  // RV-6 (1d fixer): in the Proposed view, a hidden result counts as on the Current board until the review reveals it.
  const hidden = useBoard((s) => proposedOverlay(s)?.hidden);
  const current = useBoard((s) => s.nodes);
  const actions = useBoardActions();
  const [open, setOpen] = useState<{ kind: AssumedKind; anchor: HTMLElement } | null>(null);
  const assumed = useMemo(
    () => alsoAssumed({ nodes, order, vocabulary }, hidden && hidden.size > 0 ? { hidden, current } : undefined),
    [nodes, order, vocabulary, hidden, current],
  );
  const parts = alsoAssumedParts(assumed);
  if (parts.length === 0) return null;

  const choose = (kind: AssumedKind, key: string) => {
    setOpen(null);
    if (kind === 'pending') actions.revealNode(key);
    else actions.highlightVocab(key);
  };
  const label = (kind: AssumedKind, key: string) =>
    kind === 'pending' ? (nodes[key]?.naturalName ?? key) : kind === 'existence' ? presuppositionLabel(key, subject, vocab) : displayName(key, subject, vocab);

  return (
    <div className="tl-col__assumed" data-testid="also-assumed">
      <span className="tl-col__assumed-label">also assumed:</span>
      {parts.map((part, i) => (
        <Fragment key={part.kind}>
          {i > 0 ? <span aria-hidden="true">,</span> : null}
          <button
            type="button"
            className="tl-link"
            data-assumed={part.kind}
            aria-haspopup={part.count > 1 ? 'menu' : undefined}
            aria-expanded={part.count > 1 ? open?.kind === part.kind : undefined}
            title={TITLE[part.kind].replace(/`/g, '')}
            onClick={(event) => {
              const first = assumed[part.kind][0];
              if (part.count === 1 && first !== undefined) choose(part.kind, first);
              else setOpen(open?.kind === part.kind ? null : { kind: part.kind, anchor: event.currentTarget });
            }}
          >
            {part.text}
          </button>
        </Fragment>
      ))}
      <Popover anchor={open?.anchor ?? null} open={open !== null} onClose={() => setOpen(null)} role="menu" label="Also assumed" testId="assumed-menu" className="tl-menu">
        {open
          ? assumed[open.kind].map((key) => (
              <button key={key} type="button" role="menuitem" className="tl-menu__item" data-assumed-item={key} onClick={() => choose(open.kind, key)}>
                <span className="tl-menu__text">{label(open.kind, key)}</span>
              </button>
            ))
          : null}
      </Popover>
    </div>
  );
}
