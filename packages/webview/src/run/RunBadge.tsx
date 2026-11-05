/**
 * The run in the header (docs/m2-plan.md section 6.4): a badge ("Claude: working on Spyro · 3/25 checks") that opens
 * or hides the run panel, and, for a run of another subject (at most one run per model folder), a compact line under
 * the header with "Show", which switches the board to that subject.
 */
import { runBadgeText, runNeedsUser, runStateLabel } from '../model/run';
import { useBoard, useBoardActions } from '../state/context';

export function RunBadge() {
  const run = useBoard((s) => s.run);
  const subject = useBoard((s) => s.subject);
  const open = useBoard((s) => s.runPanelOpen);
  const actions = useBoardActions();
  if (!run) return null;
  const here = run.subject === subject;
  return (
    <button
      type="button"
      className="tl-run-badge"
      data-testid="run-badge"
      data-state={run.state}
      data-attention={runNeedsUser(run) || undefined}
      aria-expanded={here ? open : undefined}
      title={here ? (open ? 'Hide the run panel' : 'Show the run panel') : `Show ${run.subject}, where Claude is running`}
      onClick={() => (here ? actions.setRunPanelOpen(!open) : actions.selectSubject(run.subject))}
    >
      <span className={`codicon codicon-${runNeedsUser(run) ? 'bell-dot' : 'sparkle'}`} aria-hidden="true" />
      {runBadgeText(run)}
    </button>
  );
}

/** Another subject's run: one compact line, with "Show" (the board then switches to that subject). */
export function RunElsewhere() {
  const run = useBoard((s) => (s.run && s.subject !== '' && s.run.subject !== s.subject ? s.run : null));
  const actions = useBoardActions();
  if (!run) return null;
  // Lower-case only its first letter: the label may name Claude ("Ready for review · Claude gave up").
  const label = runStateLabel(run, false);
  return (
    <div className="tl-banner tl-run-elsewhere" data-testid="run-elsewhere" role="status">
      <span className="codicon codicon-sparkle" aria-hidden="true" />
      <span>
        Claude’s run on <strong>{run.subject}</strong>: {label.charAt(0).toLowerCase() + label.slice(1)}.
      </span>
      <button type="button" className="tl-button tl-button--secondary tl-button--small" onClick={() => actions.selectSubject(run.subject)}>
        Show
      </button>
    </div>
  );
}
