/**
 * Toasts: the host's notices ("Deleted …" with Undo, "Copied") and the board's own refusals, at the bottom right of
 * the board (above the A|P box, which they never cover; slice 1e removed the selection tray), at most three at a time.
 *
 * Undo on a toast posts the protocol's `undo`, which always undoes the latest action. So only the newest undoable
 * toast offers it, and only while the host's Undo is that toast's action (`toastCanUndo`): after another action, an
 * Undo or a Redo, older toasts lose the button instead of undoing something else. Spec v4 UN-3 (slice 1f): while an
 * edit session (a run) is active, or the Proposed view is on screen, the button is disabled, with the reason.
 */
import { InlineCode } from '../common/InlineCode';
import { useBoard, useBoardActions } from '../state/context';
import { toastCanUndo, undoLock } from '../state/store';

const ICON = { info: 'info', warning: 'warning', error: 'error' } as const;

export function Toasts() {
  const toasts = useBoard((s) => s.toasts);
  const workspace = useBoard((s) => s.workspace);
  const lock = useBoard((s) => undoLock(s));
  const actions = useBoardActions();
  return (
    <div className="tl-toasts" role="status" aria-live="polite" data-testid="toasts">
      {toasts.map((toast) => (
        <div key={toast.key} className="tl-toast" data-level={toast.level} data-testid="toast">
          <span className={`codicon codicon-${ICON[toast.level]}`} aria-hidden="true" />
          <span className="tl-toast__text">
            <InlineCode text={toast.text} />
          </span>
          {toastCanUndo(toast, workspace) ? (
            <button
              type="button"
              className="tl-button tl-button--small"
              data-testid="toast-undo"
              title={lock ?? `Undo: ${toast.text}`}
              disabled={lock !== null}
              onClick={() => {
                actions.dismissToast(toast.key);
                actions.undo();
              }}
            >
              Undo
            </button>
          ) : null}
          <button type="button" className="tl-icon-button" aria-label="Dismiss" onClick={() => actions.dismissToast(toast.key)}>
            <span className="codicon codicon-close" aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  );
}
