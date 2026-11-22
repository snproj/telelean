import { RunBadge } from '../run/RunBadge';
import { ContextSection } from './ContextSection';
import { useMemo } from 'react';
import { sessionUndoButtons } from '../model/sessionBoard';
import { useBoard, useBoardActions } from '../state/context';
import { undoLock, undoRedoButtons, undoScopeOf } from '../state/store';
import { HistoryMenu } from './HistoryMenu';
import { legendEntries, type LegendEntry } from './legend';
import { LeanBadge, ProblemsMenu } from './LeanStatus';
import { SubjectPicker } from './SubjectPicker';

/** A swatch of the legend: a line pattern or a glyph as well as a colour (D-15, BD-9: never colour alone). */
function LegendSwatchView({ entry }: { entry: LegendEntry }) {
  switch (entry.key) {
    case 'declared':
    case 'verified':
    case 'conditional':
    case 'mismatch': {
      const variant = entry.key;
      return (
        <svg width="30" height="10" aria-hidden="true">
          <line className={`tl-legend__line tl-legend__line--${variant}`} x1="1" y1="5" x2="22" y2="5" />
          {variant === 'conditional' ? (
            <path className="tl-legend__head tl-legend__head--hollow" d="M21,1.5 L28,5 L21,8.5 z" />
          ) : variant === 'mismatch' ? (
            <path className="tl-legend__head tl-legend__head--mismatch" d="M20,1 L29,5 L20,9 L23,5 z" />
          ) : (
            <path className={`tl-legend__head tl-legend__head--${variant}`} d="M20,1 L29,5 L20,9 z" />
          )}
        </svg>
      );
    }
    case 'band':
      return (
        <svg width="30" height="14" aria-hidden="true">
          <line className="tl-legend__line tl-legend__line--verified" x1="1" y1="2" x2="27" y2="5" />
          <line className="tl-legend__line tl-legend__line--verified" x1="1" y1="12" x2="27" y2="9" />
          <path className="tl-legend__band" d="M21,1 L18,1 L18,13 L21,13" />
          <circle className="tl-legend__seal" cx="18" cy="7" r="4.5" />
          <text className="tl-legend__check" x="18" y="7" textAnchor="middle" dominantBaseline="central">
            ✓
          </text>
        </svg>
      );
    case 'formalised':
      return (
        <span className="tl-legend__aura" aria-hidden="true">
          {entry.glyph}
        </span>
      );
    case 'established':
      return (
        <span className="tl-legend__glow" aria-hidden="true">
          {entry.glyph}
        </span>
      );
    case 'pending':
      return (
        <span className="tl-legend__pending" aria-hidden="true">
          {entry.glyph}
        </span>
      );
    case 'proposed':
      // Slice 2h: a translucent line with the "+" badge at its middle (never colour alone).
      return (
        <svg width="30" height="12" aria-hidden="true">
          <line className="tl-legend__line tl-legend__line--proposed" x1="1" y1="6" x2="22" y2="6" />
          <path className="tl-legend__head tl-legend__head--verified tl-legend__head--proposed" d="M20,2 L29,6 L20,10 z" />
          <circle className="tl-arrow-badge__disc" cx="11" cy="6" r="5" />
          <text className="tl-arrow-badge__glyph tl-legend__badge" x="11" y="6" textAnchor="middle" dominantBaseline="central">
            {entry.glyph}
          </text>
        </svg>
      );
  }
}

/**
 * The legend (D-15, spec v4 BD-9; slice 1d): line pattern is epistemic status; colour, heads, glyphs, glows and the band
 * add the rest, never colour alone (`LEGEND_ENTRIES`).
 */
export function Legend() {
  // Slice 2h (§5.10): the `proposed` entry is listed only during an edit session.
  const session = useBoard((s) => s.session !== null);
  const entries = useMemo(() => legendEntries(session), [session]);
  return (
    <span className="tl-legend" aria-label="Legend">
      {entries.map((entry) => (
        <span key={entry.key} className="tl-legend__item" data-legend={entry.key} title={entry.title}>
          <LegendSwatchView entry={entry} />
          {entry.label}
        </span>
      ))}
    </span>
  );
}

/**
 * The board's Undo and Redo (the host's stack of the user's files). Spec v4 UN-3, A27 (slice 1f): while an edit
 * session (a run) is active they are disabled, with the reason as their tooltip. Slice 2h (§5.12, UN-1, D2-38): they act
 * on the stack of the view you are in (`undoScope`): in a session's Proposed view, or with the focus in the review
 * panel, the session stack ("Undo: ‹step›", disabled when sealed with UN-5's text and while a step runs with D2-62's);
 * on the Current view during a session the board stack, locked, with "Your files can't change during an edit session;
 * Undo in the Proposed view undoes your review steps."
 */
function UndoRedo() {
  const workspace = useBoard((s) => s.workspace);
  const lock = useBoard((s) => undoLock(s));
  const scope = useBoard((s) => undoScopeOf(s));
  const session = useBoard((s) => s.session);
  const busy = useBoard((s) => s.sessionBusy !== null);
  const actions = useBoardActions();
  const state = scope === 'session' && session !== null ? sessionUndoButtons(session, busy) : undoRedoButtons(workspace, lock);
  // A mouse press on a button moves the focus to it, out of `data-undo-scope="session"`, before the click runs: the click
  // would then act on the board stack while the button advertised the session's step. Keeping the focus where it is
  // keeps the scope the button showed (fixer 2h r1, F-F-V2H-FC-2). A keyboard activation has already moved the focus,
  // and the button then shows the stack it will act on.
  const keepFocus = (event: { preventDefault(): void }) => event.preventDefault();
  return (
    <span className="tl-toolbar__group" data-locked={(scope === 'board' && lock !== null) || undefined} data-undo-stack={scope}>
      <button
        type="button"
        className="tl-icon-button tl-icon-button--toolbar"
        aria-label="Undo"
        data-testid="undo"
        title={state.undo.title}
        disabled={state.undo.disabled}
        onMouseDown={keepFocus}
        onClick={() => actions.undoInScope()}
      >
        <span className="codicon codicon-discard" aria-hidden="true" />
      </button>
      <button
        type="button"
        className="tl-icon-button tl-icon-button--toolbar"
        aria-label="Redo"
        data-testid="redo"
        title={state.redo.title}
        disabled={state.redo.disabled}
        onMouseDown={keepFocus}
        onClick={() => actions.redoInScope()}
      >
        <span className="codicon codicon-redo" aria-hidden="true" />
      </button>
    </span>
  );
}

/** The toolbar, then the Context Menu section right below it (spec v4.1 CM-1, slice 1e: a row of fixed height). */
export function Header() {
  const rootName = useBoard((s) => s.workspace?.rootName ?? null);
  return (
    <>
    <header className="tl-toolbar">
      <span className="tl-toolbar__title">telelean</span>
      {rootName ? <span className="tl-toolbar__root" title="Model folder">{rootName}</span> : null}
      <SubjectPicker />
      <HistoryMenu />
      <UndoRedo />
      <LeanBadge />
      <ProblemsMenu />
      <RunBadge />
      <span className="tl-toolbar__spacer" />
      <Legend />
    </header>
    <ContextSection />
    </>
  );
}
