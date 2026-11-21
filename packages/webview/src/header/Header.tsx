import { RunBadge } from '../run/RunBadge';
import { ContextSection } from './ContextSection';
import { useBoard, useBoardActions } from '../state/context';
import { undoLock, undoRedoButtons } from '../state/store';
import { HistoryMenu } from './HistoryMenu';
import { LEGEND_ENTRIES, type LegendEntry } from './legend';
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
  }
}

/**
 * The legend (D-15, spec v4 BD-9; slice 1d): line pattern is epistemic status; colour, heads, glyphs, glows and the band
 * add the rest, never colour alone (`LEGEND_ENTRIES`).
 */
export function Legend() {
  return (
    <span className="tl-legend" aria-label="Legend">
      {LEGEND_ENTRIES.map((entry) => (
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
 * session (a run) is active they are disabled, with the reason as their tooltip; the Proposed view only exists during
 * one, so it never offers the files' Undo either (UN-1: its own stack comes with slice 2).
 */
function UndoRedo() {
  const workspace = useBoard((s) => s.workspace);
  const lock = useBoard((s) => undoLock(s));
  const actions = useBoardActions();
  const state = undoRedoButtons(workspace, lock);
  return (
    <span className="tl-toolbar__group" data-locked={lock !== null || undefined}>
      <button
        type="button"
        className="tl-icon-button tl-icon-button--toolbar"
        aria-label="Undo"
        data-testid="undo"
        title={state.undo.title}
        disabled={state.undo.disabled}
        onClick={() => actions.undo()}
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
        onClick={() => actions.redo()}
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
