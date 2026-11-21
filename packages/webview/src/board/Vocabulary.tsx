/**
 * The Vocabulary and Definitions columns above the board (spec v4 BD-1; slice 1c, split from M1's Vocabulary group at
 * the top of the Axioms column, D-3): box-shaped items grouped by kind, the presuppositions as chips ("assumes
 * characters exist"), hidden assumptions flagged, definitions that need the user's endorsement flagged. The two columns
 * scroll on their own. A divider below the band sets its height (kept in the webview state, as a fraction of the board
 * area); the band collapses to one line that keeps its counts and flags. Items can be highlighted (the band opens, the
 * item scrolls into view in its column and flashes) from a card's "uses:" dropdown, an identifier in its Lean code, or
 * the AXIOMS column's "also assumed" line.
 *
 * M2: in the proposed view it shows the proposal's vocabulary, with a diff mark (glyph, word, colour, halo) on each
 * item the proposal adds, changes or removes; the line says "+N new" and the band opens by itself (03 section 7).
 */
import type { NodeChangeKind, VocabItem } from '@telelean/core';
import { memo, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';
import { KIND_GLYPH, VOCAB_SECTIONS } from '../labels';
import { presuppositionLabel } from '../model/cardData';
import { DIFF_GLYPH, DIFF_WORD } from '../model/run';
import { useBoard, useBoardActions } from '../state/context';
import { boardView, flashTarget, proposedOverlay, readTopSplit, vocabularyCollapsed } from '../state/store';
import { revealInColumn } from './reveal';
import { bandSummary, bandSummaryText, DEFINITIONS_SECTIONS, splitVocabulary, VOCABULARY_SECTIONS } from './vocabularyBand';

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
  'definitional-choice': { label: 'needs your endorsement', title: 'A definition your statements rely on (D-4: needs your endorsement)', warn: false },
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
            <span key={flag} className={`tl-chip${FLAG_TEXT[flag].warn ? ' tl-chip--attention' : ''}`} data-flag={flag} title={FLAG_TEXT[flag].title}>
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

/** One of the band's two columns: its sections, scrolling on their own. */
function BandColumn({ title, testId, sections, items, added }: { title: string; testId: string; sections: typeof VOCAB_SECTIONS; items: readonly VocabItem[]; added: number }) {
  const shown = useMemo(
    () => sections.map((section) => ({ ...section, items: items.filter((item) => item.kind === section.kind) })).filter((section) => section.items.length > 0),
    [sections, items],
  );
  return (
    <section className="tl-vcol" data-testid={testId} aria-label={title}>
      <header className="tl-vcol__header">
        <h2 className="tl-vcol__title">{title}</h2>
        <span className="tl-col__count">{items.length}</span>
        {added > 0 ? (
          <span className="tl-diff" data-diff="added" title="What the proposal adds">
            <span className="tl-diff__glyph" aria-hidden="true">
              +
            </span>
            {added} new
          </span>
        ) : null}
      </header>
      <div className="tl-vcol__list">
        {shown.length === 0 ? <p className="tl-vcol__empty">None yet.</p> : null}
        {shown.map((section) => (
          <div key={section.kind} className="tl-vocab__section" data-section={section.kind}>
            {/* A column of one section (Definitions) needs no heading of its own. */}
            {sections.length > 1 ? <h3 className="tl-vocab__heading">{section.title}</h3> : null}
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
      </div>
    </section>
  );
}

/** How far one arrow key moves the divider (a fraction of the board area). */
const SPLIT_STEP = 0.05;

/**
 * The divider below the band: drag it, or focus it and use ↑ / ↓ (Home / End: smallest / largest), to give the band
 * more or less room; a double click or Enter goes back to the default height. The height is kept in the webview state.
 */
function BandDivider({ band }: { band: RefObject<HTMLElement | null> }) {
  const actions = useBoardActions();
  const drag = useRef<{ pointer: number; start: number; height: number; total: number; fraction: number | null } | null>(null);
  const measure = () => {
    const element = band.current;
    const area = element?.parentElement;
    if (!element || !area || area.clientHeight === 0) return null;
    return { height: element.getBoundingClientRect().height, total: area.clientHeight };
  };
  const show = (fraction: number) => {
    band.current?.style.setProperty('--tl-top-size', `${(fraction * 100).toFixed(1)}%`);
    if (band.current) band.current.dataset.sized = 'true';
  };
  const end = (event: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointer !== event.pointerId) return;
    drag.current = null;
    if (d.fraction !== null) actions.setTopSplit(d.fraction);
  };
  const nudge = (fraction: number) => {
    const value = readTopSplit(fraction);
    if (value === null) return;
    show(value);
    actions.setTopSplit(value);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const m = measure();
    if (!m) return;
    const now = m.height / m.total;
    if (event.key === 'ArrowDown') nudge(now + SPLIT_STEP);
    else if (event.key === 'ArrowUp') nudge(now - SPLIT_STEP);
    else if (event.key === 'Home') nudge(0);
    else if (event.key === 'End') nudge(1);
    else if (event.key === 'Enter') actions.setTopSplit(null);
    else return;
    event.preventDefault();
  };
  return (
    <div
      className="tl-top__divider"
      data-testid="top-divider"
      role="separator"
      tabIndex={0}
      aria-orientation="horizontal"
      aria-label="Resize the Vocabulary and Definitions columns"
      title="Drag to give the Vocabulary and Definitions columns more or less room (or focus and use ↑ ↓); double-click for the default height"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        const m = measure();
        if (!m) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { pointer: event.pointerId, start: event.clientY, height: m.height, total: m.total, fraction: null };
      }}
      onPointerMove={(event) => {
        const d = drag.current;
        if (!d || d.pointer !== event.pointerId) return;
        const fraction = readTopSplit((d.height + event.clientY - d.start) / d.total);
        if (fraction === null) return;
        d.fraction = fraction;
        show(fraction);
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
      onDoubleClick={() => actions.setTopSplit(null)}
      onKeyDown={onKeyDown}
    />
  );
}

/** The band (BD-1). Nothing when the board has no vocabulary at all. */
export function VocabularyBand() {
  const items = useBoard((s) => boardView(s).vocabulary);
  const collapsed = useBoard((s) => vocabularyCollapsed(s));
  const diff = useBoard((s) => proposedOverlay(s)?.diff.vocabulary);
  const split = useBoard((s) => s.topSplit);
  const actions = useBoardActions();
  const band = useRef<HTMLElement>(null);
  const columns = useMemo(() => splitVocabulary(items), [items]);
  const summary = useMemo(() => bandSummary(items, diff ?? {}), [items, diff]);

  // The height the user chose (the CSSOM: the CSP allows no style attributes).
  useLayoutEffect(() => {
    const element = band.current;
    if (!element) return;
    if (split === null) {
      element.style.removeProperty('--tl-top-size');
      delete element.dataset.sized;
    } else {
      element.style.setProperty('--tl-top-size', `${(split * 100).toFixed(1)}%`);
      element.dataset.sized = 'true';
    }
  }, [split, collapsed, items.length]);

  if (items.length === 0) return null;
  const added = summary.added.vocabulary + summary.added.definitions;

  return (
    <>
      <section ref={band} className="tl-vocab tl-top" data-testid="vocabulary" data-collapsed={collapsed || undefined} aria-label="Vocabulary and definitions">
        <button type="button" className="tl-vocab__toggle" aria-expanded={!collapsed} title={bandSummaryText(summary)} onClick={() => actions.toggleVocabulary()}>
          <span className={`codicon codicon-chevron-${collapsed ? 'right' : 'down'}`} aria-hidden="true" />
          <span className="tl-vocab__title">Vocabulary</span>
          <span className="tl-col__count">{summary.vocabulary}</span>
          {summary.hidden > 0 ? (
            <span className="tl-chip tl-chip--attention" title="Prop-valued axioms with no card (TL104)">
              {summary.hidden} hidden assumption{summary.hidden === 1 ? '' : 's'}
            </span>
          ) : null}
          <span className="tl-top__sep" aria-hidden="true">
            ·
          </span>
          <span className="tl-vocab__title">Definitions</span>
          <span className="tl-col__count">{summary.definitions}</span>
          {summary.endorse > 0 ? (
            <span className="tl-chip" data-flag="definitional-choice" title="Definitions your statements rely on: they need your endorsement (D-4)">
              {summary.endorse} need{summary.endorse === 1 ? 's' : ''} your endorsement
            </span>
          ) : null}
          {added > 0 ? (
            <span className="tl-diff" data-diff="added" data-testid="vocab-new" title="Vocabulary the proposal adds">
              <span className="tl-diff__glyph" aria-hidden="true">
                +
              </span>
              {added} new
            </span>
          ) : null}
        </button>
        {collapsed ? null : (
          <div className="tl-top__columns">
            <BandColumn title="Vocabulary" testId="vocabulary-column" sections={VOCABULARY_SECTIONS} items={columns.vocabulary} added={summary.added.vocabulary} />
            <BandColumn title="Definitions" testId="definitions-column" sections={DEFINITIONS_SECTIONS} items={columns.definitions} added={summary.added.definitions} />
          </div>
        )}
      </section>
      {collapsed ? null : <BandDivider band={band} />}
    </>
  );
}
