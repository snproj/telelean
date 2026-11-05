import { RunBadge } from '../run/RunBadge';
import { useBoard, useBoardActions } from '../state/context';
import { HistoryMenu } from './HistoryMenu';
import { LeanBadge, ProblemsMenu } from './LeanStatus';
import { SubjectPicker } from './SubjectPicker';

/** The legend (D-15): line pattern is epistemic status; colour and markers add the rest, never colour alone. */
export function Legend() {
  const line = (variant: 'declared' | 'verified' | 'conditional' | 'mismatch') => (
    <svg width="30" height="10" aria-hidden="true">
      <line className={`tl-legend__line tl-legend__line--${variant}`} x1="1" y1="5" x2="22" y2="5" />
      {variant === 'conditional' ? (
        <path className="tl-legend__head tl-legend__head--hollow" d="M21,1.5 L28,5 L21,8.5 z" />
      ) : (
        <path className={`tl-legend__head tl-legend__head--${variant}`} d="M20,1 L29,5 L20,9 z" />
      )}
    </svg>
  );
  return (
    <span className="tl-legend" aria-label="Legend">
      <span className="tl-legend__item" data-legend="declared" title="You declared this support (These suffice)">
        {line('declared')}
        declared
      </span>
      <span className="tl-legend__item" data-legend="verified" title="Lean checked that the proof uses it">
        {line('verified')}
        verified by Lean
      </span>
      <span className="tl-legend__item" data-legend="conditional" title="The proof takes it as a hypothesis: proved only if it holds">
        {line('conditional')}
        conditional
      </span>
      <span className="tl-legend__item" data-legend="mismatch" title="Declared but unused by the proof, or used but not declared">
        {line('mismatch')}
        mismatch
      </span>
      <span className="tl-legend__item" data-legend="aura" title="The card has a Lean statement">
        <span className="tl-legend__aura" aria-hidden="true" />
        formalised
      </span>
    </span>
  );
}

function UndoRedo() {
  const workspace = useBoard((s) => s.workspace);
  const actions = useBoardActions();
  const undo = workspace?.undo ?? null;
  const redo = workspace?.redo ?? null;
  return (
    <span className="tl-toolbar__group">
      <button type="button" className="tl-icon-button tl-icon-button--toolbar" aria-label="Undo" title={undo ? `Undo: ${undo} (Ctrl+Z)` : 'Nothing to undo'} disabled={!undo} onClick={() => actions.undo()}>
        <span className="codicon codicon-discard" aria-hidden="true" />
      </button>
      <button
        type="button"
        className="tl-icon-button tl-icon-button--toolbar"
        aria-label="Redo"
        title={redo ? `Redo: ${redo} (Ctrl+Shift+Z)` : 'Nothing to redo'}
        disabled={!redo}
        onClick={() => actions.redo()}
      >
        <span className="codicon codicon-redo" aria-hidden="true" />
      </button>
    </span>
  );
}

export function Header() {
  const rootName = useBoard((s) => s.workspace?.rootName ?? null);
  return (
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
  );
}
