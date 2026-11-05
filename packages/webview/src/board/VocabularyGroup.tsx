/**
 * The computed Vocabulary group at the top of the Assumptions column (D-3): box-shaped items grouped by kind, the
 * presuppositions as chips ("assumes characters exist"), hidden assumptions flagged. Collapsible; the state lives
 * in the webview state (per board), never in a model file. Items can be highlighted (scrolled into view within the
 * column and flashed) from a card's "uses:" dropdown or an identifier in its Lean code.
 *
 * M2: in the proposed view it shows the proposal's vocabulary, with a diff mark (glyph, word, colour, halo) on each
 * item the proposal adds, changes or removes; the header says "+N new" and the group opens by itself (03 section 7).
 */
import type { NodeChangeKind, VocabItem } from '@telelean/core';
import { memo, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { KIND_GLYPH, VOCAB_SECTIONS } from '../labels';
import { presuppositionLabel } from '../model/cardData';
import { DIFF_GLYPH, DIFF_WORD, newVocabularyCount } from '../model/run';
import { useBoard, useBoardActions } from '../state/context';
import { boardView, flashTarget, proposedOverlay, vocabularyCollapsed } from '../state/store';
import { revealInColumn } from './reveal';

const VOCAB_DIFF_TITLE: Readonly<Record<NodeChangeKind, string>> = {
  added: 'New in the proposal',
  changed: 'Changed in the proposal',
  removed: 'Removed by the proposal',
};

function VocabDiff({ change }: { change: NodeChangeKind }) {
  return (
    <span className="tl-diff" data-diff={change} data-testid="diff-badge" title={VOCAB_DIFF_TITLE[change]}>
      <span className="tl-diff__glyph" aria-hidden="true">
        {DIFF_GLYPH[change]}
      </span>
      {DIFF_WORD[change]}
    </span>
  );
}

const FLAG_TEXT: Readonly<Record<VocabItem['flags'][number], { label: string; title: string; warn: boolean }>> = {
  'unmarked-assumption': { label: 'hidden assumption', title: 'A Prop-valued axiom with no card: Lean takes it as given (TL104)', warn: true },
  'shape-violation': { label: 'shape', title: 'Breaks the simple vocabulary rule (TL111)', warn: true },
  'definitional-choice': { label: 'definition on a statement path', title: 'A definition your statements rely on (D-4: needs your endorsement)', warn: false },
  stale: { label: 'changed since last check', title: 'Its file changed since Lean last checked it (Lean checks again when the file is saved)', warn: false },
  new: { label: 'new', title: 'Added by a proposal', warn: false },
};

/** The `data-highlight` flash token for an item (0 when not flashed); scrolls the item into view when flashed. */
function useFlash(name: string, element: RefObject<HTMLElement | null>): number {
  const flashed = useBoard((s) => (s.flash?.target === flashTarget.vocab(name) ? s.flash.token : 0));
  useLayoutEffect(() => {
    if (flashed && element.current) revealInColumn(element.current);
  }, [flashed, element]);
  return flashed;
}

function UsedBy({ ids }: { ids: readonly string[] }) {
  const nodes = useBoard((s) => boardView(s).nodes);
  const actions = useBoardActions();
  const present = ids.filter((id) => nodes[id]);
  if (present.length === 0) return <p className="tl-details__none">No card uses it yet.</p>;
  return (
    <ul className="tl-details__list">
      {present.map((id) => {
        const node = nodes[id];
        return node ? (
          <li key={id}>
            <button type="button" className="tl-rel" data-rel-id={id} onClick={() => actions.revealNode(id)}>
              <span className="tl-glyph" data-kind={node.type} aria-hidden="true">
                {KIND_GLYPH[node.type]}
              </span>
              <span className="tl-rel__text">{node.naturalName}</span>
            </button>
          </li>
        ) : null;
      })}
    </ul>
  );
}

const VocabBox = memo(function VocabBox({ item }: { item: VocabItem }) {
  const ref = useRef<HTMLDivElement>(null);
  const flashed = useFlash(item.name, ref);
  const change = useBoard((s) => proposedOverlay(s)?.diff.vocabulary[item.name]);
  const actions = useBoardActions();
  const [open, setOpen] = useState(false);
  const warn = item.kind === 'unmarked-axiom' || item.flags.some((f) => FLAG_TEXT[f].warn);
  // The proposal's diff already marks a new item; the "new" flag would say it twice.
  const flags = change ? item.flags.filter((f) => f !== 'new') : item.flags;
  return (
    <div
      ref={ref}
      className="tl-vocab__item"
      data-vocab={item.name}
      data-kind-vocab={item.kind}
      data-warn={warn || undefined}
      data-highlight={flashed ? 'true' : undefined}
      data-diff={change}
    >
      <div className="tl-vocab__head">
        {change ? <VocabDiff change={change} /> : null}
        <span className="tl-vocab__name">{item.shortName}</span>
        {item.type ? (
          <code className="tl-vocab__type" title={item.type}>
            {item.type}
          </code>
        ) : null}
        <button
          type="button"
          className="tl-card__chevron"
          aria-expanded={open}
          aria-label={open ? `Hide ${item.shortName}'s code` : `Show ${item.shortName}'s code and who uses it`}
          onClick={() => setOpen(!open)}
        >
          <span className={`codicon codicon-chevron-${open ? 'down' : 'right'}`} aria-hidden="true" />
        </button>
      </div>
      {item.gloss ? (
        <div className={item.glossBy === 'agent' ? 'tl-vocab__gloss tl-gloss--agent' : 'tl-vocab__gloss'} data-provenance={item.glossBy === 'agent' ? 'agent' : 'user'}>
          {item.gloss}
          {item.glossBy === 'agent' ? <span className="tl-card__agent-marker tl-agent__marker"> (Claude's wording)</span> : null}
        </div>
      ) : null}
      {flags.length > 0 ? (
        <div className="tl-card__meta">
          {flags.map((flag) => (
            <span key={flag} className={`tl-chip${FLAG_TEXT[flag].warn ? ' tl-chip--attention' : ''}`} title={FLAG_TEXT[flag].title}>
              {FLAG_TEXT[flag].label}
            </span>
          ))}
        </div>
      ) : null}
      {open ? (
        <div className="tl-vocab__more">
          {item.code ? <pre className="tl-lean">{item.code}</pre> : null}
          <h4 className="tl-details__heading">Used by</h4>
          <UsedBy ids={item.usedBy} />
          {item.loc ? (
            <button type="button" className="tl-icon-button" onClick={() => item.loc && actions.openInEditor(item.loc.file, item.loc.range)}>
              <span className="codicon codicon-go-to-file" aria-hidden="true" />
              Open in editor
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
});

const PresuppositionChip = memo(function PresuppositionChip({ item }: { item: VocabItem }) {
  const ref = useRef<HTMLSpanElement>(null);
  const flashed = useFlash(item.name, ref);
  const subject = useBoard((s) => s.subject);
  const vocab = useBoard((s) => boardView(s).vocab);
  const change = useBoard((s) => proposedOverlay(s)?.diff.vocabulary[item.name]);
  return (
    <span
      ref={ref}
      className="tl-presup tl-vocab__presup"
      data-vocab={item.name}
      data-highlight={flashed ? 'true' : undefined}
      data-diff={change}
      title={`${item.shortName} : ${item.type ?? ''}${item.gloss ? ` (${item.gloss})` : ''}${change ? ` (${VOCAB_DIFF_TITLE[change].toLowerCase()})` : ''}`}
    >
      {change ? (
        <span className="tl-diff__glyph" aria-label={DIFF_WORD[change]}>
          {DIFF_GLYPH[change]}
        </span>
      ) : null}
      {presuppositionLabel(item.name, subject, vocab)}
    </span>
  );
});

export function VocabularyGroup() {
  const items = useBoard((s) => boardView(s).vocabulary);
  const collapsed = useBoard((s) => vocabularyCollapsed(s));
  const added = useBoard((s) => {
    const overlay = proposedOverlay(s);
    return overlay ? newVocabularyCount(overlay.diff) : 0;
  });
  const actions = useBoardActions();
  const sections = useMemo(
    () => VOCAB_SECTIONS.map((section) => ({ ...section, items: items.filter((item) => item.kind === section.kind) })).filter((s) => s.items.length > 0),
    [items],
  );
  if (items.length === 0) return null;
  const hidden = items.filter((item) => item.kind === 'unmarked-axiom').length;

  return (
    // A list item of the Assumptions column's list (the cards are the others).
    <section className="tl-vocab" role="listitem" data-testid="vocabulary" data-collapsed={collapsed || undefined} aria-label="Vocabulary">
      <button type="button" className="tl-vocab__toggle" aria-expanded={!collapsed} onClick={() => actions.toggleVocabulary()}>
        <span className={`codicon codicon-chevron-${collapsed ? 'right' : 'down'}`} aria-hidden="true" />
        <span className="tl-vocab__title">Vocabulary</span>
        <span className="tl-col__count">{items.length}</span>
        {added > 0 ? (
          <span className="tl-diff" data-diff="added" data-testid="vocab-new" title="Vocabulary the proposal adds">
            <span className="tl-diff__glyph" aria-hidden="true">
              +
            </span>
            {added} new
          </span>
        ) : null}
        {hidden > 0 ? (
          <span className="tl-chip tl-chip--attention" title="Prop-valued axioms with no card (TL104)">
            {hidden} hidden assumption{hidden === 1 ? '' : 's'}
          </span>
        ) : null}
      </button>
      {collapsed
        ? null
        : sections.map((section) => (
            <div key={section.kind} className="tl-vocab__section" data-section={section.kind}>
              <h3 className="tl-vocab__heading">{section.title}</h3>
              {section.kind === 'presupposition' ? (
                <div className="tl-vocab__chips">
                  {section.items.map((item) => (
                    <PresuppositionChip key={item.name} item={item} />
                  ))}
                </div>
              ) : (
                <div className="tl-vocab__items">
                  {section.items.map((item) => (
                    <VocabBox key={item.name} item={item} />
                  ))}
                </div>
              )}
            </div>
          ))}
    </section>
  );
}
